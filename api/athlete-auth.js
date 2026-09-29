// POST /api/athlete-auth
//   { action: 'code', code }                         → connexion par code
//   { action: 'login', email, password }             → connexion email + mot de passe
//   { action: 'register', name, email, password, coachId } → création de compte
import bcrypt from 'bcryptjs'
import { admin, handler, HttpError } from '../lib/server/core.js'

const likeSafe = s => s.replace(/[\\%_]/g, m => '\\' + m)
const PUBLIC_FIELDS = 'id,name,code,goal,perf_5k,perf_10k,records,notes'

// Petit frein anti-force-brute (par instance serveur)
const attempts = new Map()
function throttle(key) {
  const now = Date.now()
  const a = (attempts.get(key) || []).filter(t => now - t < 10 * 60 * 1000)
  if (a.length >= 10) throw new HttpError(429, 'Trop de tentatives, réessaie dans 10 minutes.')
  a.push(now); attempts.set(key, a)
}

export default handler(async ({ req, body }) => {
  const db = admin()
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'x'

  if (body.action === 'code') {
    const code = String(body.code || '').trim().toUpperCase()
    if (!code) throw new HttpError(400, 'Code manquant')
    throttle(ip)
    const { data } = await db.from('athletes').select(PUBLIC_FIELDS).eq('code', code).maybeSingle()
    if (!data) throw new HttpError(401, 'Code inconnu. Contacte ton coach.')
    return { athlete: data }
  }

  if (body.action === 'login') {
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!email || !password) throw new HttpError(400, 'Email et mot de passe requis')
    throttle(ip + email)
    const { data: acc } = await db.from('athlete_accounts').select('id,athlete_id,password_hash').ilike('email', likeSafe(email)).maybeSingle()
    if (!acc?.password_hash) throw new HttpError(401, 'Email ou mot de passe incorrect')
    let ok = false
    if (acc.password_hash.startsWith('$2')) ok = await bcrypt.compare(password, acc.password_hash)
    else {
      // anciens comptes (encodage simple) → on vérifie puis on passe en vrai hachage
      ok = Buffer.from(password, 'utf8').toString('base64') === acc.password_hash
      if (ok) await db.from('athlete_accounts').update({ password_hash: await bcrypt.hash(password, 10) }).eq('id', acc.id)
    }
    if (!ok) throw new HttpError(401, 'Email ou mot de passe incorrect')
    const { data: athlete } = await db.from('athletes').select(PUBLIC_FIELDS).eq('id', acc.athlete_id).single()
    return { athlete }
  }

  if (body.action === 'register') {
    const name = String(body.name || '').trim().slice(0, 60)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Nom et email valides requis')
    if (password.length < 6) throw new HttpError(400, 'Mot de passe : 6 caractères minimum')
    throttle(ip)
    const { data: exists } = await db.from('athlete_accounts').select('id').ilike('email', likeSafe(email)).maybeSingle()
    if (exists) throw new HttpError(409, 'Un compte existe déjà avec cet email')
    const code = name.toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '').slice(0, 8) + Math.floor(10 + Math.random() * 89)
    const { data: athlete, error } = await db.from('athletes').insert({ name, code, goal: '' }).select(PUBLIC_FIELDS).single()
    if (error) throw new HttpError(500, 'Création impossible')
    const { error: e2 } = await db.from('athlete_accounts').insert({
      athlete_id: athlete.id, email, password_hash: await bcrypt.hash(password, 10), coach_id: body.coachId || null,
    })
    if (e2) { await db.from('athletes').delete().eq('id', athlete.id); throw new HttpError(500, 'Création impossible') }
    return { athlete }
  }

  throw new HttpError(400, 'Action inconnue')
})
