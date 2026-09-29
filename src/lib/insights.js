// Calculs coach : charge d'entraînement et alertes (tout est fait dans le navigateur)
import { isoDate, mondayOf } from '../../shared/training.js'

export function keyDate(sessionKey) {
  const [, wk, d] = String(sessionKey).split('__')
  if (!wk) return null
  const dt = new Date(wk + 'T12:00:00'); dt.setDate(dt.getDate() + Number(d || 0))
  return dt
}

// Charge d'une séance réalisée ≈ RPE × km (à défaut de durée précise)
export function sessionLoad(c, slot) {
  const km = Number(c.real_km) || Number(slot?.km) || 0
  return (Number(c.rpe) || 5) * km
}

// Charge aiguë (7 j) vs chronique (moyenne hebdo sur 28 j)
export function loadRatio(athleteId, completions, weekData, ref = new Date()) {
  let acute = 0, chronic = 0, oldest = 0
  const day = 864e5
  for (const c of Object.values(completions)) {
    if (c.athlete_id !== athleteId) continue
    const d = keyDate(c.session_key); if (!d) continue
    const age = (ref - d) / day
    if (age < -0.5 || age > 28) continue
    const l = sessionLoad(c, weekData[c.session_key])
    if (age <= 7) acute += l
    chronic += l / 4
    oldest = Math.max(oldest, age)
  }
  // Pas de ratio fiable sans au moins 3 semaines d'historique
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio: chronic > 0 && oldest >= 21 ? acute / chronic : null }
}

export function athleteAlerts({ athlete, completions, weekData, wellness = [], raceGoals = [] }) {
  const alerts = []
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const wkNow = isoDate(mondayOf(today))
  const wkPrev = isoDate(mondayOf(new Date(today.getTime() - 7 * 864e5)))
  const wkNext = isoDate(mondayOf(new Date(today.getTime() + 7 * 864e5)))

  // Séances manquées (7 derniers jours, jour passé, pas de retour)
  let missed = 0
  for (const wk of [wkPrev, wkNow]) for (let i = 0; i < 7; i++) {
    const key = `${athlete.id}__${wk}__${i}`
    const s = weekData[key]; const d = keyDate(key)
    if (!s || s.session_type === 'REPOS' || completions[key]) continue
    const age = (today - d) / 864e5
    if (age >= 1 && age <= 7) missed++
  }
  if (missed >= 2) alerts.push({ level: 'warn', icon: '⏳', text: `${missed} séances sans retour ces 7 derniers jours` })
  else if (missed === 1) alerts.push({ level: 'info', icon: '⏳', text: '1 séance sans retour cette semaine' })

  // RPE élevé répété
  const hard = Object.values(completions).filter(c => c.athlete_id === athlete.id && c.rpe >= 8 && (today - keyDate(c.session_key)) / 864e5 <= 7)
  if (hard.length >= 2) alerts.push({ level: 'warn', icon: '🔥', text: `${hard.length} séances à RPE ≥ 8 en 7 jours` })

  // Charge
  const { ratio } = loadRatio(athlete.id, completions, weekData, today)
  if (ratio && ratio > 1.5) alerts.push({ level: 'alert', icon: '📈', text: `Charge en forte hausse (ratio ${ratio.toFixed(2)}) — risque de blessure` })
  else if (ratio !== null && ratio < 0.6) alerts.push({ level: 'info', icon: '📉', text: `Charge en baisse (ratio ${ratio.toFixed(2)})` })

  // Bien-être
  const last = wellness.filter(w => w.athlete_id === athlete.id).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (last && (today - new Date(last.date + 'T12:00:00')) / 864e5 <= 3) {
    if (last.fatigue <= 3 || last.soreness <= 3) alerts.push({ level: 'alert', icon: '🦵', text: `Check-in du ${new Date(last.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${last.soreness <= 3 ? 'douleurs musculaires' : 'grosse fatigue'}${last.notes ? ` — « ${last.notes.slice(0, 80)} »` : ''}` })
    else if (last.form <= 4 || last.moral <= 3) alerts.push({ level: 'warn', icon: '🧠', text: 'Forme ou moral en baisse au dernier check-in' })
  }

  // Semaine prochaine vide
  const nextPlanned = Array.from({ length: 7 }, (_, i) => weekData[`${athlete.id}__${wkNext}__${i}`]).filter(Boolean).length
  if (!nextPlanned) alerts.push({ level: 'todo', icon: '🗓', text: 'Rien de programmé la semaine prochaine' })

  // Course proche
  const race = raceGoals.filter(g => g.athlete_id === athlete.id).map(g => ({ ...g, days: Math.round((new Date(g.date + 'T12:00:00') - today) / 864e5) })).filter(g => g.days >= 0 && g.days <= 21).sort((a, b) => a.days - b.days)[0]
  if (race) alerts.push({ level: 'info', icon: '🏁', text: `${race.name} dans ${race.days} jour${race.days > 1 ? 's' : ''}` })

  return alerts
}

export const ALERT_COLORS = { alert: 'var(--danger)', warn: 'var(--gold)', todo: 'var(--lime)', info: 'var(--text-3)' }
