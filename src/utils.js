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

// Calculate zones from multiple records
// Uses the best predictor (most reliable distance for the athlete profile)
export function calculateZonesFromRecords(records) {
  if (!records || records.length === 0) return BASE_ZONES.map(z => ({ ...z, paceMin: '—', paceMax: '—' }))

  // Priority: 10km > 5km > semi > others
  const priority = ['10km', '5km', 'Semi-marathon', 'Marathon', '3000m', '1500m', '800m']
  let bestRecord = null
  let bestDist = null

  for (const dist of priority) {
    const r = records.find(r => r.distance === dist)
    if (r) { bestRecord = r; bestDist = dist; break }
  }

  if (!bestRecord) bestRecord = records[0]

  // Convert to 5km equivalent pace
  const distMap = { '800m': 0.8, '1000m': 1, '1500m': 1.5, '1 mile': 1.609, '3000m': 3, '5km': 5, '10km': 10, 'Semi-marathon': 21.097, 'Marathon': 42.195, '50km': 50, '100km': 100 }
  const km = distMap[bestRecord.distance] || 5
  const secs = time5kToSecs(bestRecord.time)
  const pacePerKm = secs / km

  // Normalize to seuil reference
  const refSeuil = pacePerKm * 1.05

  return BASE_ZONES.map(z => ({
    ...z,
    paceMin: secsToPace(Math.round(refSeuil * z.refFactor * 1.03)),
    paceMax: secsToPace(Math.round(refSeuil * z.refFactor * 0.97)),
  }))
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

export function generateTCX(name, blocks, zones) {
  const steps = []
  blocks?.forEach(b => {
    if (b.isLoop && b.loopBlocks) {
      // Add repeated steps
      for (let r = 0; r < (b.loopReps || 1); r++) {
        b.loopBlocks.forEach(lb => steps.push(lb))
      }
    } else {
      steps.push(b)
    }
  })

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `<Workouts><Workout Sport="Running"><Name>${name}</Name>`,
    `<Step xsi:type="Repeat_t"><StepId>1</StepId><Repetitions>1</Repetitions>`,
  ]

  steps.forEach((s, i) => {
    const z = zones[s.zone - 1]
    const durationSecs = s.durationType === 'time'
      ? (s.timeUnit === 'min' ? s.duration * 60 : s.timeUnit === 'h' ? s.duration * 3600 : s.duration)
      : null
    const distMeters = s.durationType === 'distance'
      ? (s.distUnit === 'km' ? s.distance * 1000 : s.distance)
      : null

    lines.push(`<Child xsi:type="Step_t"><StepId>${i + 2}</StepId><Name>${s.name || `Z${s.zone}`}</Name>`)
    if (durationSecs) lines.push(`<Duration xsi:type="Time_t"><Seconds>${durationSecs}</Seconds></Duration>`)
    else if (distMeters) lines.push(`<Duration xsi:type="Distance_t"><Meters>${distMeters}</Meters></Duration>`)

    const pm = parsePace(z?.paceMin), px = parsePace(z?.paceMax)
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

export function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getStravaAuthUrl(athleteId) {
  const params = new URLSearchParams({
    client_id: '254589',
    redirect_uri: 'https://rawrun-coaching.vercel.app',
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: athleteId,
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}
