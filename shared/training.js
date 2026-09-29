// Logique d'entraînement partagée entre le site (navigateur) et le serveur (/api).
// ⚠️ Imports avec extension .js obligatoires (utilisé aussi côté serveur Node).

export const BASE_ZONES = [
  { id: 1,  name: 'Endurance Fondamentale Basse', short: 'EFB',  color: '#8b8b94', refFactor: 1.55 },
  { id: 2,  name: 'Endurance Fondamentale Haute', short: 'EFH',  color: '#a1a1aa', refFactor: 1.43 },
  { id: 3,  name: 'Endurance Active Basse',        short: 'EAB',  color: '#38bdf8', refFactor: 1.32 },
  { id: 4,  name: 'Endurance Active Haute (SV1)',  short: 'EAH',  color: '#3b82f6', refFactor: 1.25 },
  { id: 5,  name: 'Tempo Bas (SV1→AS42)',          short: 'TB',   color: '#4ade80', refFactor: 1.18 },
  { id: 6,  name: 'Tempo Haut (AS42→AS21)',        short: 'TH',   color: '#c8ff2e', refFactor: 1.12 },
  { id: 7,  name: 'Seuil Bas (>AS21)',             short: 'SB',   color: '#fde047', refFactor: 1.07 },
  { id: 8,  name: 'Seuil Haut (SV2→AS10)',         short: 'SH',   color: '#fbbf24', refFactor: 1.02 },
  { id: 9,  name: 'VMA Longue (AS10→AS5)',         short: 'VL',   color: '#fb923c', refFactor: 0.97 },
  { id: 10, name: 'VMA Moyenne (AS5→AS3)',         short: 'VM',   color: '#ff5a1f', refFactor: 0.93 },
  { id: 11, name: 'VMA Courte (>AS3)',             short: 'VC',   color: '#ef4444', refFactor: 0.88 },
  { id: 12, name: 'Allures Spécifiques 1500m',     short: '1500', color: '#e11d48', refFactor: 0.83 },
  { id: 13, name: 'Allures Spécifiques 800m',      short: '800',  color: '#be123c', refFactor: 0.80 },
  { id: 14, name: 'Allures Spécifiques Élevées',   short: 'SPÉ',  color: '#9f1239', refFactor: 0.75 },
]

export const SESSION_TYPES = [
  { id: 'EF',      label: 'Endurance Fondamentale', short: 'EF',   color: '#a1a1aa' },
  { id: 'SEUIL',   label: 'Seuil / Tempo',          short: 'SEUIL', color: '#fde047' },
  { id: 'VMA',     label: 'VMA / Intervalles',       short: 'VMA',  color: '#ff5a1f' },
  { id: 'FARTLEK', label: 'Fartlek',                 short: 'FK',   color: '#a78bfa' },
  { id: 'COTES',   label: 'Côtes / PPG',             short: 'CÔT',  color: '#fb923c' },
  { id: 'SORTIE',  label: 'Sortie Longue',           short: 'SL',   color: '#818cf8' },
  { id: 'PISTE',   label: 'Piste',                   short: 'PST',  color: '#38bdf8' },
  { id: 'RECUP',   label: 'Récupération Active',     short: 'REC',  color: '#71717a' },
  { id: 'REPOS',   label: 'Repos',                   short: '—',    color: '#27272a' },
  { id: 'COMP',    label: 'Compétition',             short: 'COMP', color: '#c8ff2e' },
  { id: 'CROSS',   label: 'Cross / Trail',           short: 'TRL',  color: '#84cc16' },
  { id: 'RENFO',   label: 'Renforcement',            short: 'RNF',  color: '#f472b6' },
]

export const DIST_KM = { '800m': 0.8, '1000m': 1, '1500m': 1.5, '1 mile': 1.609, '3000m': 3, '5km': 5, '10km': 10, 'Semi-marathon': 21.097, 'Marathon': 42.195, '50km': 50, '100km': 100 }

export function timeToSecs(str) {
  if (!str) return 0
  const p = String(str).trim().replace(/h/i, ':').split(':').map(Number)
  if (p.some(isNaN)) return 0
  if (p.length === 2) return p[0] * 60 + p[1]
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]
  return 0
}
export function secsToPace(s) {
  if (!s || s <= 0 || !isFinite(s)) return '—'
  const m = Math.floor(s / 60), r = Math.round(s % 60)
  return r === 60 ? `${m + 1}:00` : `${m}:${String(r).padStart(2, '0')}`
}
export function parsePace(str) {
  if (!str || str === '—') return 0
  const [m, s] = String(str).split(':').map(Number)
  return m * 60 + (s || 0)
}

// Allures Smart Pace à partir du meilleur record (priorité 10 km > 5 km > semi…)
export function zonesFromReference(pacePerKm) {
  const refSeuil = pacePerKm * 1.05
  return BASE_ZONES.map(z => ({
    ...z,
    paceMin: secsToPace(Math.round(refSeuil * z.refFactor * 1.03)), // plus lent
    paceMax: secsToPace(Math.round(refSeuil * z.refFactor * 0.97)), // plus rapide
  }))
}
export function emptyZones() { return BASE_ZONES.map(z => ({ ...z, paceMin: '—', paceMax: '—' })) }

export function referenceRecord(records = []) {
  const priority = ['10km', '5km', 'Semi-marathon', 'Marathon', '3000m', '1500m', '800m']
  for (const d of priority) { const r = records.find(x => x.distance === d && timeToSecs(x.time)); if (r) return r }
  return records.find(r => timeToSecs(r.time)) || null
}

export function athleteZones(athlete) {
  const rec = referenceRecord(athlete?.records || [])
  if (rec) return zonesFromReference(timeToSecs(rec.time) / (DIST_KM[rec.distance] || 5))
  if (athlete?.perf_10k && timeToSecs(athlete.perf_10k)) return zonesFromReference(timeToSecs(athlete.perf_10k) / 10)
  if (athlete?.perf_5k && timeToSecs(athlete.perf_5k)) return zonesFromReference(timeToSecs(athlete.perf_5k) / 5)
  return emptyZones()
}

// ── Distances des blocs ──
const toSeconds = (v, u) => u === 'min' ? Number(v) * 60 : u === 'h' ? Number(v) * 3600 : Number(v)
export function blockSeconds(b) { return b.durationType === 'time' ? toSeconds(b.duration, b.timeUnit) : 0 }

export function calcBlockDistance(block, zones) {
  if (block.durationType === 'distance') return block.distUnit === 'km' ? Number(block.distance) : Number(block.distance) / 1000
  const z = zones[block.zone - 1]
  const p = parsePace(z?.paceMin) && parsePace(z?.paceMax) ? (parsePace(z.paceMin) + parsePace(z.paceMax)) / 2 : 0
  return p > 0 ? blockSeconds(block) / p : 0
}
export function calcTotalDistance(blocks = [], zones) {
  let total = 0
  for (const b of blocks) {
    if (b.isLoop) total += (b.loopBlocks || []).reduce((s, lb) => s + calcBlockDistance(lb, zones), 0) * (b.loopReps || 1)
    else total += calcBlockDistance(b, zones)
  }
  return Math.round(total * 10) / 10
}
export function calcTotalMinutes(blocks = [], zones) {
  const secsOf = b => {
    if (b.durationType === 'time') return blockSeconds(b)
    const z = zones[b.zone - 1]; const p = (parsePace(z?.paceMin) + parsePace(z?.paceMax)) / 2
    return p ? calcBlockDistance(b, zones) * p : 0
  }
  let s = 0
  for (const b of blocks) s += b.isLoop ? (b.loopBlocks || []).reduce((a, lb) => a + secsOf(lb), 0) * (b.loopReps || 1) : secsOf(b)
  return Math.round(s / 60)
}

// ── Conversion du format IA ("steps") vers les blocs du SessionBuilder ──
let uid = 0
const newId = () => `${Date.now().toString(36)}${(uid++).toString(36)}`
const clampZone = z => Math.min(14, Math.max(1, Math.round(Number(z) || 1)))

function stepToBlock(s) {
  const base = { id: newId(), name: String(s.name || '').slice(0, 60), zone: clampZone(s.zone), lapMode: s.lap ? 'lap' : 'auto', isLoop: false, loopReps: 1, loopBlocks: [] }
  if (s.distance_m && Number(s.distance_m) > 0) {
    const m = Number(s.distance_m)
    return m >= 1000 && m % 100 === 0
      ? { ...base, durationType: 'distance', distance: m / 1000, distUnit: 'km', duration: 10, timeUnit: 'min' }
      : { ...base, durationType: 'distance', distance: Math.round(m), distUnit: 'm', duration: 10, timeUnit: 'min' }
  }
  const sec = Math.max(5, Math.round(Number(s.duration_s) || (Number(s.duration_min) || 5) * 60))
  if (sec % 60 === 0) return { ...base, durationType: 'time', duration: sec / 60, timeUnit: 'min', distance: 400, distUnit: 'm' }
  return { ...base, durationType: 'time', duration: sec, timeUnit: 'sec', distance: 400, distUnit: 'm' }
}

export function stepsToBlocks(steps = []) {
  const out = []
  for (const s of Array.isArray(steps) ? steps : []) {
    if (s?.type === 'repeat' || Array.isArray(s?.steps)) {
      const inner = (s.steps || []).filter(x => x && x.type !== 'repeat').map(stepToBlock)
      if (!inner.length) continue
      out.push({ id: newId(), name: String(s.name || '').slice(0, 60), zone: inner[0].zone, isLoop: true, loopReps: Math.min(60, Math.max(1, Math.round(Number(s.reps) || 1))), loopBlocks: inner, durationType: 'time', duration: 0, timeUnit: 'min', lapMode: 'auto' })
    } else if (s) out.push(stepToBlock(s))
  }
  return out
}

export function blocksToText(blocks = []) {
  const one = b => `${b.name ? b.name + ' ' : ''}${b.durationType === 'time' ? `${b.duration}${b.timeUnit}` : `${b.distance}${b.distUnit}`} Z${b.zone}`
  return blocks.map(b => b.isLoop ? `${b.loopReps}×(${(b.loopBlocks || []).map(one).join(' + ')})` : one(b)).join(' / ')
}

export const TYPE_IDS = SESSION_TYPES.map(t => t.id)
export const normalizeType = t => TYPE_IDS.includes(String(t).toUpperCase()) ? String(t).toUpperCase() : 'EF'

// ── Dates (en heure locale, jamais toISOString qui décale d'un jour en France) ──
export function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function mondayOf(date) { const d = new Date(date); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d }
export function addWeeks(weekKey, n) { const d = new Date(weekKey + 'T12:00:00'); d.setDate(d.getDate() + n * 7); return isoDate(d) }
export function weeksBetween(fromWeekKey, toDate) {
  const a = new Date(fromWeekKey + 'T12:00:00'), b = mondayOf(new Date(toDate + 'T12:00:00'))
  return Math.round((b - a) / (7 * 864e5)) + 1
}
