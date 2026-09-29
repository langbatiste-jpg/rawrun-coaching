// GET /api/cron-reminders — lancé chaque jour par Vercel Cron (voir vercel.json)
// Envoie à chaque athlète (qui a un e-mail) un rappel pour sa séance du lendemain.
import { admin, handler, HttpError } from '../lib/server/core.js'
import { sendEmail, layout } from '../lib/server/email.js'

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

function parisTomorrow() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const t = new Date(now); t.setDate(now.getDate() + 1)
  const dayIndex = (t.getDay() + 6) % 7
  const monday = new Date(t); monday.setDate(t.getDate() - dayIndex)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { weekKey: iso(monday), dayIndex, label: `${DAYS[dayIndex]} ${t.getDate()}/${t.getMonth() + 1}` }
}

export default handler(async ({ req }) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'Non autorisé')
  const db = admin()
  const { weekKey, dayIndex, label } = parisTomorrow()
  const { data: slots } = await db.from('week_slots').select('athlete_id,session_type,session_id,km,note')
    .eq('week_key', weekKey).eq('day_index', dayIndex).neq('session_type', 'REPOS')
  let sent = 0
  for (const s of slots || []) {
    const { data: acc } = await db.from('athlete_accounts').select('email').eq('athlete_id', s.athlete_id).maybeSingle()
    if (!acc?.email) continue
    const { data: sess } = s.session_id ? await db.from('sessions').select('name,description').eq('id', s.session_id).maybeSingle() : { data: null }
    const title = sess?.name || s.session_type
    await sendEmail({
      to: acc.email,
      subject: `🏃 Demain : ${title}`,
      html: layout({ kicker: `SÉANCE DE ${label.toUpperCase()}`, title, body: [s.km ? `${s.km} km` : '', s.note || '', sess?.description || ''].filter(Boolean).join('\n\n') }),
    })
    sent++
  }
  return { sent, weekKey, dayIndex }
}, { methods: ['GET'] })
