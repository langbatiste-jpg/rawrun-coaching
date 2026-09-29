// POST /api/notify — e-mails de notification (message, séance validée)
// Les destinataires sont déterminés ici, côté serveur : impossible d'utiliser ce point
// d'entrée pour envoyer des e-mails à n'importe qui.
import { admin, handler, HttpError, requireCoach, isCoachRequest, escapeHtml } from '../lib/server/core.js'
import { sendEmail, layout } from '../lib/server/email.js'

const recent = new Map()
function throttle(key, max = 20) {
  const now = Date.now()
  const a = (recent.get(key) || []).filter(t => now - t < 60 * 60 * 1000)
  if (a.length >= max) throw new HttpError(429, 'Trop de notifications')
  a.push(now); recent.set(key, a)
}

export default handler(async ({ req, body }) => {
  const coachEmail = process.env.COACH_EMAIL
  const { type, athlete_id } = body
  if (!athlete_id) throw new HttpError(400, 'athlete_id manquant')

  // Coach → athlète
  if (isCoachRequest(req)) {
    const { db } = await requireCoach(req)
    if (type !== 'message') throw new HttpError(400, 'Type inconnu')
    const { data: acc } = await db.from('athlete_accounts').select('email').eq('athlete_id', athlete_id).maybeSingle()
    if (!acc?.email) return { skipped: 'athlète sans e-mail' }
    return sendEmail({
      to: acc.email,
      subject: `💬 Message de ton coach — ${String(body.session_name || '').slice(0, 60)}`,
      html: layout({ kicker: 'NOUVEAU MESSAGE', title: body.session_name || 'Séance', body: escapeHtml(String(body.text || '').slice(0, 2000)) }),
    })
  }

  // Athlète → coach
  const db = admin()
  const { data: athlete } = await db.from('athletes').select('id,name').eq('id', athlete_id).maybeSingle()
  if (!athlete) throw new HttpError(404, 'Athlète inconnu')
  throttle(athlete_id)
  if (!coachEmail) return { skipped: 'COACH_EMAIL non configuré' }

  if (type === 'message') {
    return sendEmail({
      to: coachEmail,
      subject: `💬 ${athlete.name} — ${String(body.session_name || '').slice(0, 60)}`,
      html: layout({ kicker: athlete.name.toUpperCase(), title: body.session_name || 'Message', body: escapeHtml(String(body.text || '').slice(0, 2000)) }),
    })
  }
  if (type === 'completion') {
    const rpe = Number(body.rpe) || 0
    return sendEmail({
      to: coachEmail,
      subject: `✅ ${athlete.name} a validé : ${String(body.session_name || 'sa séance').slice(0, 60)}`,
      html: layout({
        kicker: 'SÉANCE VALIDÉE', accent: '#c8ff2e',
        title: `${athlete.name} — ${body.session_name || 'Séance'}`,
        body: `RPE ${rpe}/10${body.real_km ? ` · ${escapeHtml(body.real_km)} km` : ''}${body.sensations ? `\n\n« ${escapeHtml(String(body.sensations).slice(0, 1000))} »` : ''}`,
      }),
    })
  }
  throw new HttpError(400, 'Type inconnu')
})
