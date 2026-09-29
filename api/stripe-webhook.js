// POST /api/stripe-webhook — Stripe prévient ici quand un paiement est validé ou un abonnement arrêté.
// À déclarer dans Stripe → Développeurs → Webhooks (voir guide).
import { admin } from '../lib/server/core.js'
import { verifyWebhook } from '../lib/server/stripe.js'
import { sendEmail, layout } from '../lib/server/email.js'
import { escapeHtml } from '../lib/server/core.js'

export const config = { api: { bodyParser: false } }

const readRaw = req => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  req.on('error', reject)
})
const euros = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

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
      const kind = obj.metadata?.kind || 'shop'
      let ids = []
      try { ids = JSON.parse(obj.metadata?.items || '[]') } catch {}
      let items = []
      if (kind === 'shop') {
        const { data: products } = await db.from('products').select('id,name,price_cents,stock').in('id', ids.map(i => i[0]))
        items = ids.map(([id, qty]) => { const p = products?.find(x => x.id === id); return { id, qty, name: p?.name || '?', price_cents: p?.price_cents } })
        for (const it of items) {
          const p = products?.find(x => x.id === it.id)
          if (p && p.stock !== null) await db.from('products').update({ stock: Math.max(0, p.stock - it.qty) }).eq('id', p.id)
        }
      } else {
        const [offerId, ...optionIds] = ids
        const [{ data: offer }, { data: options }] = await Promise.all([
          db.from('offers').select('id,name,price_cents,interval').eq('id', offerId || '').maybeSingle(),
          optionIds.length ? db.from('offer_options').select('id,name,price_cents,interval').in('id', optionIds) : Promise.resolve({ data: [] }),
        ])
        items = [offer, ...(options || [])].filter(Boolean).map(x => ({ id: x.id, name: x.name, price_cents: x.price_cents, interval: x.interval }))
      }
      const cd = obj.customer_details || {}
      const shipping = obj.collected_information?.shipping_details || obj.shipping_details || null
      await db.from('orders').upsert({
        stripe_session_id: obj.id, kind, status: obj.mode === 'subscription' ? 'active' : 'paid',
        email: cd.email, name: cd.name, phone: cd.phone, items, amount_cents: obj.amount_total, shipping,
        stripe_subscription_id: obj.subscription || null,
      }, { onConflict: 'stripe_session_id' })

      if (process.env.COACH_EMAIL) {
        const list = items.map(i => `• ${escapeHtml(i.name)}${i.qty ? ` × ${i.qty}` : ''}`).join('\n')
        const addr = shipping?.address ? `\n\nLivraison : ${escapeHtml(shipping.name || '')}, ${escapeHtml([shipping.address.line1, shipping.address.line2, shipping.address.postal_code, shipping.address.city, shipping.address.country].filter(Boolean).join(' '))}` : ''
        await sendEmail({
          to: process.env.COACH_EMAIL,
          subject: kind === 'shop' ? `🛒 Nouvelle commande — ${euros(obj.amount_total)}` : `🎉 Nouvel abonné — ${escapeHtml(cd.name || cd.email || '')}`,
          html: layout({ kicker: kind === 'shop' ? 'BOUTIQUE' : 'COACHING', accent: '#c8ff2e', title: `${cd.name || ''} ${cd.email ? `(${cd.email})` : ''}`, body: `${list}\n\nTotal : ${euros(obj.amount_total)}${addr}` }),
        })
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      await db.from('orders').update({ status: 'canceled' }).eq('stripe_subscription_id', obj.id)
    }
    res.status(200).json({ received: true })
  } catch (e) {
    console.error('webhook', e)
    res.status(500).json({ error: 'traitement impossible' })
  }
}
