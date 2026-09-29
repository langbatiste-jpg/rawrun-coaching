// POST /api/checkout — crée une page de paiement Stripe
//   { kind: 'coaching', offer_id, option_ids: [], email? }
//   { kind: 'shop', items: [{ product_id, qty }], email? }
// Les prix sont TOUJOURS relus en base : le navigateur ne peut pas les modifier.
import { admin, handler, HttpError } from '../lib/server/core.js'
import { stripe } from '../lib/server/stripe.js'
import { BRAND } from '../shared/brand.js'

const COUNTRIES = ['FR', 'BE', 'LU', 'CH', 'DE', 'MC']

function line(name, description, cents, recurring, qty = 1, image) {
  return {
    quantity: qty,
    price_data: {
      currency: 'eur', unit_amount: cents,
      product_data: { name: name.slice(0, 120), description: description ? description.slice(0, 300) : undefined, images: image ? { 0: image } : undefined },
      recurring: recurring ? { interval: 'month' } : undefined,
    },
  }
}

export default handler(async ({ req, body }) => {
  const db = admin()
  const origin = req.headers.origin && /^https:\/\//.test(req.headers.origin) ? req.headers.origin : (process.env.SITE_URL || 'https://rawrun-coaching.vercel.app')
  const email = /^\S+@\S+\.\S+$/.test(body.email || '') ? body.email : undefined
  const lines = []
  let meta

  if (body.kind === 'coaching') {
    const { data: offer } = await db.from('offers').select('*').eq('id', body.offer_id || '').eq('active', true).maybeSingle()
    if (!offer) throw new HttpError(404, "Cette offre n'est plus disponible")
    const ids = Array.isArray(body.option_ids) ? body.option_ids.slice(0, 10) : []
    const { data: options } = ids.length ? await db.from('offer_options').select('*').in('id', ids).eq('active', true) : { data: [] }
    lines.push(line(offer.name, offer.description, offer.price_cents, offer.interval === 'month'))
    for (const o of options || []) lines.push(line(o.name, o.description, o.price_cents, o.interval === 'month'))
    meta = { kind: 'coaching', items: JSON.stringify([offer.id, ...(options || []).map(o => o.id)]) }
  } else if (body.kind === 'shop') {
    const wanted = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map(i => ({ id: String(i.product_id), qty: Math.min(20, Math.max(1, Math.round(Number(i.qty) || 1))) }))
    if (!wanted.length) throw new HttpError(400, 'Panier vide')
    const { data: products } = await db.from('products').select('*').in('id', wanted.map(w => w.id)).eq('active', true)
    for (const w of wanted) {
      const p = (products || []).find(x => x.id === w.id)
      if (!p) throw new HttpError(404, 'Un produit du panier n\'est plus en vente')
      if (p.stock !== null && p.stock < w.qty) throw new HttpError(409, `Plus assez de stock pour « ${p.name} » (${p.stock} restant${p.stock > 1 ? 's' : ''})`)
      lines.push(line(p.name, p.description, p.price_cents, false, w.qty, p.image_url && /^https:\/\//.test(p.image_url) ? p.image_url : undefined))
    }
    meta = { kind: 'shop', items: JSON.stringify(wanted.map(w => [w.id, w.qty])) }
  } else throw new HttpError(400, 'Type de commande inconnu')

  if (meta.items.length > 490) throw new HttpError(400, 'Panier trop grand')
  // Livraison : forfait (SHIPPING_CENTS, 4,90 € par défaut), offerte au-delà de FREE_SHIPPING_CENTS, ou remise en main propre
  let shipping_options
  if (meta.kind === 'shop') {
    const subtotal = lines.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0)
    const fee = subtotal >= Number(process.env.FREE_SHIPPING_CENTS || 5000) ? 0 : Number(process.env.SHIPPING_CENTS || 490)
    const rate = (name, amount) => ({ shipping_rate_data: { type: 'fixed_amount', display_name: name, fixed_amount: { amount, currency: 'eur' } } })
    shipping_options = { 0: rate(fee ? 'Livraison à domicile' : 'Livraison offerte', fee), 1: rate('Remise en main propre (entraînement)', 0) }
  }
  const recurring = lines.some(l => l.price_data.recurring)
  const session = await stripe('checkout/sessions', {
    mode: recurring ? 'subscription' : 'payment',
    line_items: Object.fromEntries(lines.map((l, i) => [i, l])),
    success_url: `${origin}/?commande=ok&type=${meta.kind}`,
    cancel_url: `${origin}/?commande=annulee#${meta.kind === 'shop' ? 'boutique' : 'offres'}`,
    customer_email: email,
    locale: 'fr',
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    phone_number_collection: { enabled: 'true' },
    shipping_address_collection: meta.kind === 'shop' ? { allowed_countries: Object.fromEntries(COUNTRIES.map((c, i) => [i, c])) } : undefined,
    shipping_options,
    metadata: meta,
    subscription_data: recurring ? { metadata: meta, description: `${BRAND.full}` } : undefined,
  })
  return { url: session.url }
})
