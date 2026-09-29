// POST /api/ai — assistant de programmation (réservé au coach connecté)
//   { action: 'outline', params }                         → grandes phases du plan semaine par semaine
//   { action: 'weeks', params, outline, from, to, done }  → détail des séances pour les semaines from..to
//   { action: 'session', text, athlete_id? }              → une séance décrite en texte → blocs
//   { action: 'analyze', athlete_id }                     → bilan de forme + conseils
import { handler, HttpError, requireCoach } from '../lib/server/core.js'
import { callClaude, STEPS_SCHEMA, SESSION_SCHEMA } from '../lib/server/ai.js'
import { athleteZones, stepsToBlocks, calcTotalDistance, normalizeType, addWeeks, blocksToText, enforceStructure, SESSION_TYPES } from '../shared/training.js'
import { DEFAULT_METHOD, DEFAULT_RULES, rulesText } from '../shared/method.js'

export const config = { maxDuration: 300 }

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const clip = (s, n = 1500) => String(s || '').slice(0, n)

function zonesTable(zones) {
  return zones.map(z => `Z${z.id} ${z.short} — ${z.name} : ${z.paceMax}–${z.paceMin} /km`).join('\n')
}

async function athleteContext(db, athleteId) {
  if (!athleteId) return { athlete: null, zones: athleteZones(null), text: 'Athlète : non précisé (utilise les zones sans allures chiffrées).' }
  const { data: athlete } = await db.from('athletes').select('id,name,goal,notes,records,perf_5k,perf_10k').eq('id', athleteId).maybeSingle()
  if (!athlete) throw new HttpError(404, 'Athlète introuvable')
  const zones = athleteZones(athlete)

  // Historique récent (6 semaines)
  const since = new Date(); since.setDate(since.getDate() - 42)
  const sinceKey = since.toISOString().slice(0, 10)
  const [{ data: slots }, { data: comps }, { data: well }, { data: strava }, { data: goals }] = await Promise.all([
    db.from('week_slots').select('week_key,day_index,session_type,km').eq('athlete_id', athleteId).gte('week_key', sinceKey),
    db.from('completions').select('session_key,rpe,real_km,sensations,created_at').eq('athlete_id', athleteId).gte('created_at', since.toISOString()),
    db.from('wellness').select('date,form,fatigue,moral,sleep,soreness,notes').eq('athlete_id', athleteId).gte('date', sinceKey).order('date'),
    db.from('strava_activities').select('name,distance,moving_time,average_heartrate,start_date').eq('athlete_id', athleteId).order('start_date', { ascending: false }).limit(12),
    db.from('race_goals').select('name,date,distance,target_time,goal_type').eq('athlete_id', athleteId).order('date'),
  ])
  const byWeek = {}
  for (const s of slots || []) { const w = (byWeek[s.week_key] ||= { planned: 0, n: 0, done: 0, realKm: 0, rpe: [] }); if (s.session_type !== 'REPOS') { w.planned += Number(s.km) || 0; w.n++ } }
  for (const c of comps || []) {
    const [, wk] = c.session_key.split('__'); const w = byWeek[wk]; if (!w) continue
    w.done++; w.realKm += Number(c.real_km) || 0; if (c.rpe) w.rpe.push(c.rpe)
  }
  const hist = Object.entries(byWeek).sort().map(([wk, w]) =>
    `- sem. du ${wk} : ${Math.round(w.planned)} km prévus, ${w.done}/${w.n} séances faites, ${Math.round(w.realKm)} km réalisés${w.rpe.length ? `, RPE moyen ${(w.rpe.reduce((a, b) => a + b, 0) / w.rpe.length).toFixed(1)}` : ''}`).join('\n')
  const feel = (comps || []).filter(c => c.sensations).slice(-5).map(c => `- RPE ${c.rpe} : « ${clip(c.sensations, 160)} »`).join('\n')
  const avg = k => well?.length ? (well.reduce((a, w) => a + (w[k] || 0), 0) / well.length).toFixed(1) : null
  const wellTxt = well?.length ? `Forme ${avg('form')}/10, fraîcheur ${avg('fatigue')}/10, moral ${avg('moral')}/10, sommeil ${avg('sleep')}/10, absence de douleurs ${avg('soreness')}/10 (moyennes sur ${well.length} check-ins)` : 'aucun check-in'
  const stravaTxt = (strava || []).map(a => `- ${a.start_date?.slice(0, 10)} ${a.name} : ${Number(a.distance).toFixed(1)} km en ${Math.round(a.moving_time / 60)} min${a.average_heartrate ? `, FC moy ${Math.round(a.average_heartrate)}` : ''}`).join('\n')

  const text = `ATHLÈTE : ${athlete.name}
Objectif déclaré : ${athlete.goal || '—'}
Notes du coach : ${clip(athlete.notes, 600) || '—'}
Records : ${(athlete.records || []).map(r => `${r.distance} en ${r.time}`).join(', ') || [athlete.perf_5k && `5 km en ${athlete.perf_5k}`, athlete.perf_10k && `10 km en ${athlete.perf_10k}`].filter(Boolean).join(', ') || 'aucun'}
Courses prévues : ${(goals || []).map(g => `${g.name} (${g.distance || '?'}) le ${g.date}${g.target_time ? `, objectif ${g.target_time}` : ''}`).join(' ; ') || 'aucune'}

ZONES SMART PACE DE L'ATHLÈTE (allure rapide – allure lente) :
${zonesTable(zones)}

HISTORIQUE 6 SEMAINES :
${hist || 'aucune donnée'}
Ressentis récents :
${feel || 'aucun'}
Bien-être : ${wellTxt}
Sorties Strava récentes :
${stravaTxt || 'aucune'}`
  return { athlete, zones, text }
}

function systemPrompt({ method, rules }) {
  return `Tu es l'assistant de programmation de Batiste Lang, coach de course à pied. Tu programmes EXACTEMENT comme lui : tu reprends sa méthode, son vocabulaire (EF, EA, AS42, AS21, AS10, RAC, SV1, SV2) et ses formats de séance. Français, tutoiement dans les consignes à l'athlète.

RÈGLES NON NÉGOCIABLES :
${rulesText(rules)}

MÉTHODE DU COACH (à respecter strictement, c'est sa façon de travailler) :
${clip(method || DEFAULT_METHOD, 9000)}

RÈGLES TECHNIQUES :
- Les intensités s'expriment UNIQUEMENT en zones Smart Pace (1 à 14). Les allures chiffrées sont calculées par l'application.
- Une séance = une liste d'étapes (step) et de répétitions (repeat). Chaque step a soit duration_s, soit distance_m.
- Mets l'échauffement (step nommé « Échauffement EF », zone 2) et le retour au calme (step nommé « Retour au calme », zone 1) comme des steps séparés.
- La description d'une séance = l'intention du coach pour l'athlète, en 1-2 phrases simples.
- Pour du fractionné : un repeat contenant l'effort puis la récupération (ex : 6 × [1000 m Z9 + 90 s Z1]).
- Endurance fondamentale : un seul step (ex : 50 min Z2).
- Types de séance possibles : ${SESSION_TYPES.filter(t => t.id !== 'REPOS').map(t => `${t.id} (${t.label})`).join(', ')}.`
}

function planBrief(p) {
  const days = (p.days || []).map(d => DAYS[d]).join(', ')
  return `PARAMÈTRES DU PLAN :
- Course objectif : ${p.race_name || '—'} — ${p.race_distance || '—'} le ${p.race_date || '—'}${p.race_date ? ` (${DAYS[(new Date(p.race_date + 'T12:00:00').getDay() + 6) % 7]})` : ''}${p.target_time ? `, temps visé ${p.target_time}` : ''}
- Début : semaine du lundi ${p.start_week}, durée ${p.weeks} semaines (la dernière contient la course)
- Niveau : ${p.level || 'intermédiaire'}
- Séances de course par semaine : ${p.sessions_per_week}
- Jours disponibles : ${days || 'tous'} ; sortie longue de préférence le ${DAYS[p.long_run_day ?? 6]}
- Volume actuel ≈ ${p.current_km || '?'} km/sem, volume max souhaité ≈ ${p.peak_km || '?'} km/sem
- Renforcement : ${p.strength ? '1 à 2 fois par semaine (à signaler via with_strength)' : 'non'}
- Contraintes / remarques : ${clip(p.constraints, 800) || 'aucune'}`
}

const OUTLINE_TOOL = {
  name: 'plan_outline',
  description: 'Structure macro du plan, une entrée par semaine.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nom du plan, ex: "Marathon de Lyon – sub 3h"' },
      summary: { type: 'string', description: 'Logique du plan en 3-5 phrases pour le coach' },
      weeks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            week: { type: 'integer' },
            phase: { type: 'string', description: 'Fondation, Développement, Spécifique, Affûtage, Course…' },
            focus: { type: 'string', description: 'Objectif de la semaine en une phrase' },
            target_km: { type: 'number' },
            is_recovery: { type: 'boolean' },
            key_sessions: { type: 'array', items: { type: 'string' }, description: '1 à 3 séances clés en quelques mots' },
          },
          required: ['week', 'phase', 'focus', 'target_km', 'key_sessions'],
        },
      },
    },
    required: ['name', 'summary', 'weeks'],
  },
}

const WEEKS_TOOL = {
  name: 'plan_weeks',
  description: 'Détail jour par jour des semaines demandées. Les jours de repos sont simplement omis.',
  input_schema: {
    type: 'object',
    properties: {
      weeks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            week: { type: 'integer' },
            days: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day_index: { type: 'integer', minimum: 0, maximum: 6, description: '0 = lundi … 6 = dimanche' },
                  ...SESSION_SCHEMA.properties,
                  athlete_note: { type: 'string', description: "Consigne perso pour l'athlète ce jour-là (nutrition, cardio, sensations…), courte" },
                  with_strength: { type: 'boolean' },
                },
                required: ['day_index', 'session_type', 'name', 'description', 'steps'],
              },
            },
          },
          required: ['week', 'days'],
        },
      },
    },
    required: ['weeks'],
  },
}

function toDay(d, zones, rules) {
  const blocks = enforceStructure(stepsToBlocks(d.steps), normalizeType(d.session_type), rules)
  return {
    day_index: Math.min(6, Math.max(0, Number(d.day_index) || 0)),
    session_type: normalizeType(d.session_type),
    name: clip(d.name, 80), description: clip(d.description, 800), note: clip(d.athlete_note, 400),
    with_strength: !!d.with_strength, blocks, km: calcTotalDistance(blocks, zones),
  }
}

async function coachMethod(db, user) {
  const { data } = await db.from('coaches').select('method,rules').ilike('email', user.email.replace(/[\\%_]/g, m => '\\' + m)).maybeSingle()
  return { method: data?.method || DEFAULT_METHOD, rules: { ...DEFAULT_RULES, ...(data?.rules || {}) } }
}

export default handler(async ({ req, body }) => {
  const { db, user } = await requireCoach(req)
  const p = body.params || {}
  const coach = await coachMethod(db, user)

  if (body.action === 'outline') {
    const n = Math.min(40, Math.max(1, Number(p.weeks) || 0))
    if (!n || !p.start_week) throw new HttpError(400, 'Dates du plan manquantes')
    const ctx = await athleteContext(db, p.athlete_id)
    const out = await callClaude({
      system: systemPrompt(coach), tool: OUTLINE_TOOL, maxTokens: 6000,
      prompt: `${ctx.text}\n\n${planBrief({ ...p, weeks: n })}\n\nConstruis la structure du plan sur exactement ${n} semaines (week = 1 à ${n}). Tiens compte de l'historique et de l'état de forme actuel pour le point de départ du volume.`,
    })
    const weeks = Array.from({ length: n }, (_, i) => {
      const w = (out.weeks || []).find(x => x.week === i + 1) || out.weeks?.[i] || {}
      return { week: i + 1, week_key: addWeeks(p.start_week, i), phase: clip(w.phase, 40) || '—', focus: clip(w.focus, 300), target_km: Math.round(Number(w.target_km) || 0), is_recovery: !!w.is_recovery, key_sessions: (w.key_sessions || []).slice(0, 3).map(s => clip(s, 120)) }
    })
    return { name: clip(out.name, 100), summary: clip(out.summary, 1500), weeks }
  }

  if (body.action === 'weeks') {
    const outline = Array.isArray(body.outline) ? body.outline : []
    const from = Number(body.from), to = Number(body.to)
    if (!from || !to || to < from || to - from > 3) throw new HttpError(400, 'Plage de semaines invalide (4 max par lot)')
    const ctx = await athleteContext(db, p.athlete_id)
    const outlineTxt = outline.map(w => `S${w.week} (${w.week_key}) — ${w.phase}${w.is_recovery ? ' [allégée]' : ''} — ${w.target_km} km — ${w.focus} — clés : ${(w.key_sessions || []).join(' | ')}`).join('\n')
    const doneTxt = (Array.isArray(body.done) ? body.done : []).slice(-6).map(w => `S${w.week} : ${(w.days || []).filter(d => d.session_type !== 'EF').map(d => `${d.name} [${blocksToText(d.blocks)}]`).join(' ; ')}`).join('\n')
    const out = await callClaude({
      system: systemPrompt(coach), tool: WEEKS_TOOL, maxTokens: 14000,
      prompt: `${ctx.text}\n\n${planBrief(p)}\n\nSTRUCTURE VALIDÉE DU PLAN :\n${outlineTxt}\n\n${doneTxt ? `SÉANCES DE QUALITÉ DÉJÀ PROGRAMMÉES (ne pas les répéter à l'identique, faire progresser) :\n${doneTxt}\n\n` : ''}Détaille maintenant les semaines ${from} à ${to} : exactement ${p.sessions_per_week} séances de course par semaine sur les jours disponibles, en respectant le volume cible de chaque semaine.${outline.some(w => w.week >= from && w.week <= to && w.week === outline.length) ? ` La semaine ${outline.length} contient la course : place-la le bon jour avec le type COMP.` : ''}`,
    })
    const weeks = []
    for (let w = from; w <= to; w++) {
      const src = (out.weeks || []).find(x => x.week === w) || out.weeks?.[w - from]
      if (!src?.days?.length) continue // semaine non renvoyée : elle reste « à détailler »
      const days = (src.days || []).map(d => toDay(d, ctx.zones, coach.rules)).sort((a, b) => a.day_index - b.day_index)
      const uniq = []; for (const d of days) if (!uniq.some(u => u.day_index === d.day_index)) uniq.push(d)
      weeks.push({ week: w, week_key: addWeeks(p.start_week, w - 1), days: uniq })
    }
    return { weeks }
  }

  if (body.action === 'session') {
    const text = clip(body.text, 1200).trim()
    if (!text) throw new HttpError(400, 'Décris la séance')
    const ctx = await athleteContext(db, body.athlete_id)
    const out = await callClaude({
      system: systemPrompt(coach), tool: { name: 'session', description: 'Une séance structurée', input_schema: SESSION_SCHEMA }, maxTokens: 3000,
      prompt: `${body.athlete_id ? ctx.text + '\n\n' : ''}Transforme cette demande du coach en séance structurée :\n« ${text} »`,
    })
    const d = toDay({ ...out, day_index: 0 }, ctx.zones, coach.rules)
    return { name: d.name, session_type: d.session_type, description: d.description, blocks: d.blocks, km: d.km }
  }

  if (body.action === 'analyze') {
    const ctx = await athleteContext(db, body.athlete_id)
    return callClaude({
      system: systemPrompt(coach), maxTokens: 2500,
      tool: {
        name: 'bilan', description: "Bilan de l'athlète pour le coach",
        input_schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'watch', 'alert'], description: 'ok = tout va bien, watch = à surveiller, alert = agir' },
            headline: { type: 'string', description: 'Résumé en une phrase' },
            analysis: { type: 'string', description: 'Analyse en 4-6 phrases : charge, régularité, ressentis, forme' },
            suggestions: { type: 'array', items: { type: 'string' }, description: '2 à 4 ajustements concrets pour les 7 prochains jours' },
          },
          required: ['status', 'headline', 'analysis', 'suggestions'],
        },
      },
      prompt: `${ctx.text}\n\nFais le bilan de cet athlète pour son coach. Sois factuel, signale les signes de fatigue, de sous-charge ou de blessure potentielle.`,
    })
  }

  throw new HttpError(400, 'Action inconnue')
})
