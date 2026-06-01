import { BASE_ZONES } from './constants'

export function time5kToSecs(str) {
  if (!str) return 0
  const p = str.split(':').map(Number)
  if (p.length === 2) return p[0] * 60 + p[1]
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  return 0
}

export function secsToPace(s) {
  if (!s || s <= 0) return '—'
  return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')}`
}

export function parsePace(str) {
  if (!str || str === '—') return 0
  const [m, s] = str.split(':').map(Number)
  return m * 60 + (s || 0)
}

export function calculateZones(perf, dist = 5) {
  const total = time5kToSecs(perf)
  if (!total) return BASE_ZONES.map(z => ({ ...z, paceMin: '—', paceMax: '—' }))
  const refPace = total / dist
  const refSeuil = refPace * 1.05
  return BASE_ZONES.map(z => ({
    ...z,
    paceMin: secsToPace(Math.round(refSeuil * z.refFactor * 1.03)),
    paceMax: secsToPace(Math.round(refSeuil * z.refFactor * 0.97)),
  }))
}

export function getWeekKey(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  const s = new Date(d)
  s.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return s.toISOString().slice(0, 10)
}

export function generateTCX(name, steps) {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `<Workouts><Workout Sport="Running"><Name>${name}</Name>`,
    `<Step xsi:type="Repeat_t"><StepId>1</StepId><Repetitions>1</Repetitions>`,
  ]
  steps.forEach((s, i) => {
    lines.push(`<Child xsi:type="Step_t"><StepId>${i + 2}</StepId><Name>${s.name || 'Bloc'}</Name>`)
    if (s.durationType === 'time') lines.push(`<Duration xsi:type="Time_t"><Seconds>${s.duration}</Seconds></Duration>`)
    else lines.push(`<Duration xsi:type="Distance_t"><Meters>${s.distance}</Meters></Duration>`)
    const pm = parsePace(s.paceMin), px = parsePace(s.paceMax)
    if (pm > 0 && px > 0) {
      const lo = (1000 / pm).toFixed(3), hi = (1000 / px).toFixed(3)
      lines.push(`<Target xsi:type="Speed_t"><SpeedZone xsi:type="CustomSpeedZone_t"><LowInMetersPerSecond>${lo}</LowInMetersPerSecond><HighInMetersPerSecond>${hi}</HighInMetersPerSecond></SpeedZone></Target>`)
    }
    lines.push(`</Child>`)
  })
  lines.push(`</Step></Workout></Workouts></TrainingCenterDatabase>`)
  return lines.join('\n')
}

export function downloadTCX(content, filename) {
  const blob = new Blob([content], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename + '.tcx'; a.click()
  URL.revokeObjectURL(url)
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
