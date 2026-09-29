// Stripe via son API REST (pas de dépendance). Clé secrète : STRIPE_SECRET_KEY sur Vercel.
import crypto from 'node:crypto'
import { HttpError } from './core.js'

// Transforme { a: { b: 1 }, c: [x] } en a[b]=1&c[0]=x (format attendu par Stripe)
export function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') formEncode(v, key, out)
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
  }
  return out.join('&')
}

export async function stripe(path, params, method = 'POST') {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new HttpError(503, 'Paiement pas encore activé (STRIPE_SECRET_KEY manquante sur Vercel)')
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : formEncode(params || {}),
  })
  const data = await res.json()
  if (!res.ok) { console.error('Stripe', data?.error); throw new HttpError(502, 'Paiement indisponible : ' + (data?.error?.message || res.status)) }
  return data
}

// Vérifie la signature d'un webhook Stripe (en-tête Stripe-Signature)
export function verifyWebhook(raw, header, secret, toleranceSec = 300) {
  if (!secret) throw new HttpError(500, 'STRIPE_WEBHOOK_SECRET manquante')
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=')).filter(p => p.length === 2).map(([k, v]) => [k, v]))
  const sigs = String(header || '').split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  if (!parts.t || !sigs.length) throw new HttpError(400, 'Signature absente')
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) throw new HttpError(400, 'Signature expirée')
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex')
  const ok = sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)))
  if (!ok) throw new HttpError(400, 'Signature invalide')
  return JSON.parse(raw)
}
