// Outils partagés par les fonctions serveur (/api). Jamais envoyé au navigateur.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const admin = () => {
  if (!url || !serviceKey) throw new HttpError(500, 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY manquante sur Vercel).')
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export function handler(fn, { methods = ['POST'] } = {}) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'Méthode non autorisée')
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const out = await fn({ req, res, body })
      if (!res.headersSent) res.status(200).json(out ?? { ok: true })
    } catch (e) {
      const status = e.status || 500
      if (status >= 500) console.error(e)
      if (!res.headersSent) res.status(status).json({ error: e.message || 'Erreur serveur' })
    }
  }
}

// Vérifie que la requête vient du coach connecté (Supabase Auth + table coaches)
export async function requireCoach(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Connexion coach requise')
  const db = admin()
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user?.email) throw new HttpError(401, 'Session coach expirée, reconnecte-toi')
  const { data: coach } = await db.from('coaches').select('email').ilike('email', data.user.email.replace(/[\\%_]/g, m => '\\' + m)).maybeSingle()
  if (!coach) throw new HttpError(403, "Ce compte n'est pas un compte coach")
  return { db, user: data.user }
}

export function isCoachRequest(req) {
  return !!(req.headers.authorization || '').match(/^Bearer\s+\S+/i)
}

export const escapeHtml = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
