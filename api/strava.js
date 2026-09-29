// POST /api/strava
//   { action: 'connect', athlete_id, code }  → échange le code OAuth, stocke les jetons, importe les sorties
//   { action: 'sync', athlete_id }           → ré-importe les dernières sorties (jeton rafraîchi si besoin)
// Le Client Secret Strava reste sur le serveur (STRAVA_CLIENT_SECRET sur Vercel).
import { admin, handler, HttpError } from '../lib/server/core.js'

const CLIENT_ID = process.env.STRAVA_CLIENT_ID || '254589'

async function tokenRequest(params) {
  const secret = process.env.STRAVA_CLIENT_SECRET
  if (!secret) throw new HttpError(500, 'STRAVA_CLIENT_SECRET non configuré sur Vercel')
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: secret, ...params }),
  })
  const data = await res.json()
  if (!data.access_token) throw new HttpError(400, 'Strava a refusé la connexion')
  return data
}

async function importActivities(db, athleteId, token) {
  const res = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=30', { headers: { Authorization: `Bearer ${token}` } })
  const list = await res.json()
  if (!Array.isArray(list)) return 0
  const rows = list.filter(a => ['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type || a.type)).map(a => ({
    athlete_id: athleteId, strava_id: a.id, name: a.name, distance: a.distance / 1000, moving_time: a.moving_time,
    average_speed: a.average_speed, average_heartrate: a.average_heartrate, max_heartrate: a.max_heartrate, start_date: a.start_date,
    raw: { total_elevation_gain: a.total_elevation_gain, sport_type: a.sport_type, suffer_score: a.suffer_score },
  }))
  if (rows.length) await db.from('strava_activities').upsert(rows, { onConflict: 'strava_id' })
  return rows.length
}

export default handler(async ({ body }) => {
  const db = admin()
  const { data: athlete } = await db.from('athletes').select('id').eq('id', body.athlete_id || '').maybeSingle()
  if (!athlete) throw new HttpError(404, 'Athlète inconnu')

  if (body.action === 'connect') {
    const t = await tokenRequest({ code: body.code, grant_type: 'authorization_code' })
    await db.from('strava_tokens').upsert({ athlete_id: athlete.id, strava_athlete_id: t.athlete?.id, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at })
    await db.from('athlete_accounts').update({ strava_connected: true }).eq('athlete_id', athlete.id)
    return { imported: await importActivities(db, athlete.id, t.access_token) }
  }

  if (body.action === 'sync') {
    const { data: tok } = await db.from('strava_tokens').select('*').eq('athlete_id', athlete.id).maybeSingle()
    if (!tok) throw new HttpError(404, 'Strava non connecté')
    let access = tok.access_token
    if (tok.expires_at * 1000 < Date.now() + 60_000) {
      const t = await tokenRequest({ refresh_token: tok.refresh_token, grant_type: 'refresh_token' })
      access = t.access_token
      await db.from('strava_tokens').update({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at }).eq('athlete_id', athlete.id)
    }
    return { imported: await importActivities(db, athlete.id, access) }
  }
  throw new HttpError(400, 'Action inconnue')
})
