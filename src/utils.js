
import { timeToSecs, secsToPace, parsePace, athleteZones, zonesFromReference, emptyZones, DIST_KM, isoDate, mondayOf } from '../shared/training.js'
export { secsToPace, parsePace, athleteZones, isoDate, mondayOf }
export const time5kToSecs = timeToSecs

export function calculateZonesFromRecords(records) { return athleteZones({ records }) }
export function calculateZones(perf, dist = 5) {
  const t = timeToSecs(perf)
  return t ? zonesFromReference(t / dist) : emptyZones()
}

export function getWeekKey(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  return isoDate(mondayOf(d))
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
    if (pm > 0 && px > 0 && ![1, 2].includes(Number(s.zone))) {
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
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr + 'T00:00:00') - t) / 864e5)
}

export function getStravaAuthUrl(athleteId) {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_STRAVA_CLIENT_ID || '254589',
    redirect_uri: window.location.origin,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
    state: athleteId,
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}
