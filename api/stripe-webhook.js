// POST /api/stripe-webhook — Stripe prévient ici quand un paiement est validé ou un abonnement arrêté.
// Ce qui se passe automatiquement :
//  • Coaching : un profil athlète est créé (ou retrouvé par e-mail), un code d'accès lui est envoyé par e-mail.
//  • Boutique : numéro de commande, stock mis à jour, e-mail de confirmation au client, bon de livraison prêt côté coach.
//  • Toujours : e-mail + notification pour le coach.
import { admin, escapeHtml } from '../lib/server/core.js'
import { verifyWebhook } from '../lib/server/stripe.js'
import { sendEmail, layout } from '../lib/server/email.js'

export const config = { api: { bodyParser: false } }

const SITE = process.env.SITE_URL || 'https://rawrun-coaching.vercel.app'
const readRaw = req => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', reject)
})
const euros = c => (Number(c || 0) / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const likeSafe = s => String(s).replace(/[\\%_]/g, m => '\\' + m)
const firstName = n => String(n || '').trim().split(/\s+/)[0] || ''

async function orderNo(db) {
  const { data, error } = await db.rpc('next_order_no')
  return !error && data ? data : `LANG-${Date.now().toString(36).toUpperCase()}`
}

// Code d'accès unique (ex. HUGO4827) — sans caractères ambigus
async function uniqueCode(db, name) {
  const base = String(name || 'ATHLETE').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '').slice(0, 6) || 'LANG'
  for (let i = 0; i < 8; i++) {
    const code = base + Math.floor(1000 + Math.random() * 9000)
    const { data } = await db.from('athletes').select('id').eq('code', code).maybeSingle()
    if (!data) return code
  }
  return base + Date.now().toString().slice(-6)
}

// Retrouve l'athlète par e-mail, sinon le crée
async function athleteForBuyer(db, { email, name, offerName }) {
  if (email) {
    const { data: acc } = await db.from('athlete_accounts').select('athlete_id').ilike('email', likeSafe(email)).maybeSingle()
    if (acc?.athlete_id) {
      const { data: a } = await db.from('athletes').select('id,name,code').eq('id', acc.athlete_id).maybeSingle()
      if (a) return { athlete: a, created: false }
    }
  }
  const code = await uniqueCode(db, firstName(name) || (email || '').split('@')[0])
  const { data: athlete, error } = await db.from('athletes').insert({
    name: name || email || 'Nouvel athlète', code, goal: '', notes: `Inscrit via le site — ${offerName || 'coaching'}`,
  }).select('id,name,code').single()
  if (error) throw error
  if (email) await db.from('athlete_accounts').insert({ athlete_id: athlete.id, email: email.toLowerCase(), password_hash: null })
  return { athlete, created: true }
}

const addressText = s => s?.address ? [s.name, s.address.line1, s.address.line2, `${s.address.postal_code || ''} ${s.address.city || ''}`.trim(), s.address.country].filter(Boolean).join(', ') : ''

export default async function webhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  let event
  try {
    const raw = typeof req.rawBody === 'string' ? req.rawBody : await readRaw(req)
    event = verifyWebhook(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  try {
    const db = admin()
    const obj = event.data?.object || {}

    if (event.type === 'checkout.session.completed' && obj.payment_status !== 'unpaid') {
      // Stripe peut renvoyer deux fois le même événement : on ne traite qu'une fois
      const { data: already } = await db.from('orders').select('id').eq('stripe_session_id', obj.id).maybeSingle()
      if (already) return res.status(200).json({ received: true, duplicate: true })

      const kind = obj.metadata?.kind || 'shop'
      let ids = []
      try { ids = JSON.parse(obj.metadata?.items || '[]') } catch {}
      const cd = obj.customer_details || {}
      const shipping = obj.collected_information?.shipping_details || obj.shipping_details || null
      const shippingChoice = obj.shipping_cost?.shipping_rate ? (obj.shipping_cost.amount_total ? 'Livraison à domicile' : 'Livraison offerte / main propre') : null
      let items = [], athlete = null, created = false
      const no = await orderNo(db)

      if (kind === 'shop') {
        const { data: products } = await db.from('products').select('id,name,price_cents,stock,sku,cost_cents').in('id', ids.map(i => i[0]))
        items = ids.map(([id, qty]) => { const p = products?.find(x => x.id === id); return { id, qty, name: p?.name || '?', price_cents: p?.price_cents, sku: p?.sku || null, cost_cents: p?.cost_cents || 0 } })
        for (const it of items) {
          const p = products?.find(x => x.id === it.id)
          if (p && p.stock !== null) await db.from('products').update({ stock: Math.max(0, p.stock - it.qty) }).eq('id', p.id)
        }
      } else {
        const [offerId, ...optionIds] = ids
        const [{ data: offer }, { data: options }] = await Promise.all([
          db.from('offers').select('id,name,price_cents,interval,calls_per_week').eq('id', offerId || '').maybeSingle(),
          optionIds.length ? db.from('offer_options').select('id,name,price_cents,interval').in('id', optionIds) : Promise.resolve({ data: [] }),
        ])
        items = [offer, ...(options || [])].filter(Boolean).map(x => ({ id: x.id, name: x.name, price_cents: x.price_cents, interval: x.interval }))
        ;({ athlete, created } = await athleteForBuyer(db, { email: cd.email, name: cd.name, offerName: offer?.name }))
        await db.from('athletes').update({ subscription_status: obj.mode === 'subscription' ? 'active' : null, goal: offer?.name || '' }).eq('id', athlete.id)
      }

      const { data: savedOrder } = await db.from('orders').insert({
        stripe_session_id: obj.id, order_no: no, kind, status: obj.mode === 'subscription' ? 'active' : 'paid',
        email: cd.email, name: cd.name, phone: cd.phone, items, amount_cents: obj.amount_total,
        shipping: shipping ? { ...shipping, method: shippingChoice } : null,
        stripe_subscription_id: obj.subscription || null, athlete_id: athlete?.id || null, access_code: athlete?.code || null,
      }).select('id').single()

      // Compta : sortie de stock au coût d'achat (pour le coût des marchandises vendues)
      if (kind === 'shop') {
        const moves = items.filter(i => i.id && i.name !== '?').map(i => ({ product_id: i.id, qty: -i.qty, type: 'vente', unit_cost_cents: i.cost_cents || 0, order_id: savedOrder?.id || null, note: no }))
        if (moves.length) { const { error } = await db.from('stock_movements').insert(moves); if (error) console.warn('stock_movements', error.message) }
      }

      const list = items.map(i => `• ${escapeHtml(i.name)}${i.qty ? ` × ${i.qty}` : ''}`).join('\n')

      // ── E-mail au client ──
      if (cd.email) {
        if (kind === 'coaching') {
          await sendEmail({
            to: cd.email,
            subject: `🏃 Bienvenue ${firstName(cd.name)} — ton code d'accès LANG`,
            html: layout({
              kicker: created ? 'TON ACCÈS AU COACHING' : 'TON COACHING EST ACTIVÉ', accent: '#c8ff2e',
              title: `Ton code : ${athlete.code}`,
              body: `Merci pour ta confiance !\n\n${list}\n\n1. Ouvre le site (bouton ci-dessous)\n2. « Se connecter » → onglet « Code »\n3. Entre ton code : <b style="font-size:20px;letter-spacing:2px;color:#ff5a1f">${escapeHtml(athlete.code)}</b>\n\nTon coach te contacte sous 48 h pour ton bilan de départ (records, objectifs, disponibilités). Garde ce code, il te sert à chaque connexion.\n\nCommande ${no} · ${euros(obj.amount_total)}`,
            }),
          })
        } else {
          await sendEmail({
            to: cd.email,
            subject: `✅ Commande ${no} confirmée`,
            html: layout({
              kicker: 'COMMANDE CONFIRMÉE', accent: '#c8ff2e', title: `Merci ${firstName(cd.name)} !`,
              body: `${list}\n\nTotal payé : ${euros(obj.amount_total)}\n${shipping?.address ? `Livraison : ${escapeHtml(addressText(shipping))}` : 'Remise en main propre à l\'entraînement'}\n\nOn prépare ton colis et on te prévient dès qu'il part.\nNuméro de commande : ${no}`,
            }),
          })
        }
      }

      // ── Coach : notification dans l'appli + e-mail ──
      const title = kind === 'shop' ? `🛒 Commande ${no} — ${cd.name || cd.email} — ${euros(obj.amount_total)}` : `🎉 ${cd.name || cd.email} a pris ${items[0]?.name || 'un coaching'} (code ${athlete.code})`
      await db.from('notifications').insert({ athlete_id: athlete?.id || null, type: kind === 'shop' ? 'order' : 'subscription', title, detail: items.map(i => `${i.name}${i.qty ? ` × ${i.qty}` : ''}`).join(', '), read: false })
      if (process.env.COACH_EMAIL) {
        await sendEmail({
          to: process.env.COACH_EMAIL,
          subject: title,
          html: layout({
            kicker: kind === 'shop' ? 'À EXPÉDIER' : (created ? 'NOUVEL ATHLÈTE' : 'ABONNEMENT RENOUVELÉ / AJOUTÉ'), accent: '#c8ff2e',
            title: `${cd.name || ''} ${cd.email ? `(${cd.email})` : ''}`,
            body: kind === 'shop'
              ? `${list}\n\n${shipping?.address ? `📦 ${escapeHtml(addressText(shipping))}` : '🤝 Remise en main propre'}${cd.phone ? `\n📞 ${escapeHtml(cd.phone)}` : ''}\n\nTotal : ${euros(obj.amount_total)}\nLe bon de livraison est prêt : Espace coach → Boutique → Commandes.`
              : `${list}\n\nCode d'accès envoyé au client : ${escapeHtml(athlete.code)}${created ? '\nSon profil a été créé dans « Athlètes » : ajoute ses records puis lance un plan IA.' : ''}\n\nTotal : ${euros(obj.amount_total)}`,
          }),
        })
      }
    }

    // Renouvellement mensuel d'un abonnement → recette dans la compta
    if (event.type === 'invoice.paid' && obj.billing_reason === 'subscription_cycle' && obj.amount_paid > 0) {
      const { data: order } = await db.from('orders').select('id,name,email,items').eq('stripe_subscription_id', obj.subscription || '').maybeSingle()
      const label = `Abonnement ${(order?.items || [])[0]?.name || ''} · ${order?.name || obj.customer_email || ''}`.trim()
      const { data: dup } = await db.from('compta_entries').select('id').eq('note', obj.id).maybeSingle()
      if (!dup) await db.from('compta_entries').insert({ date: new Date((obj.status_transitions?.paid_at || obj.created) * 1000).toISOString().slice(0, 10), kind: 'recette', category: 'Prestations de coaching', label, amount_cents: obj.amount_paid, supplier: order?.name || obj.customer_email, payment: 'Stripe', order_id: order?.id || null, note: obj.id })
    }

    if (event.type === 'customer.subscription.deleted') {
      const { data: order } = await db.from('orders').select('id,athlete_id,name,email').eq('stripe_subscription_id', obj.id).maybeSingle()
      await db.from('orders').update({ status: 'canceled' }).eq('stripe_subscription_id', obj.id)
      if (order?.athlete_id) await db.from('athletes').update({ subscription_status: 'canceled' }).eq('id', order.athlete_id)
      if (order) {
        await db.from('notifications').insert({ athlete_id: order.athlete_id, type: 'subscription', title: `⚠️ ${order.name || order.email} a arrêté son abonnement`, read: false })
        if (process.env.COACH_EMAIL) await sendEmail({ to: process.env.COACH_EMAIL, subject: `⚠️ Abonnement arrêté — ${order.name || order.email}`, html: layout({ kicker: 'ABONNEMENT ARRÊTÉ', title: order.name || order.email, body: `L'abonnement ne sera plus prélevé. Son accès reste ouvert : à toi de décider.\n\n<a href="${SITE}" style="color:#ff5a1f">Ouvrir l'espace coach</a>` }) })
      }
    }
    res.status(200).json({ received: true })
  } catch (e) {
    console.error('webhook', e)
    res.status(500).json({ error: 'traitement impossible' })
  }
}
