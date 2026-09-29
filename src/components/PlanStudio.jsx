import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { api } from '../api'
import { Overlay, FG } from './ui'
import SessionBuilder from './SessionBuilder'
import PrintSheet, { printPlan } from './PrintSheet'
import { SESSION_TYPES, calcTotalDistance, addWeeks, weeksBetween, isoDate, mondayOf, blocksToText } from '../../shared/training.js'
import { DEFAULT_METHOD } from '../../shared/method.js'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const PHASE_COLORS = { fondation: '#71717a', 'développement': '#38bdf8', developpement: '#38bdf8', 'spécifique': '#ff5a1f', specifique: '#ff5a1f', affûtage: '#c8ff2e', affutage: '#c8ff2e', course: '#fbbf24', 'récupération': '#52525b' }
const phaseColor = p => { const k = String(p || '').toLowerCase(); for (const [n, c] of Object.entries(PHASE_COLORS)) if (k.includes(n)) return c; return '#a78bfa' }
const BATCH = 2
const nextMonday = () => { const d = mondayOf(new Date()); d.setDate(d.getDate() + 7); return isoDate(d) }
const loadMethod = () => { try { return localStorage.getItem('rr_method') || DEFAULT_METHOD } catch { return DEFAULT_METHOD } }

export default function PlanStudio({ athletes, raceGoals, getAthleteZones, showToast, onPublished, startWith }) {
  const [plans, setPlans] = useState([])
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(!!startWith)
  const [printData, setPrintData] = useState(null)

  const load = async () => {
    const { data, error } = await supabase.from('training_plans').select('*').order('updated_at', { ascending: false })
    if (error) showToast('Table training_plans absente : lance la migration SQL (voir guide)', 'err')
    setPlans(data || [])
  }
  useEffect(() => { load() }, [])

  const plan = plans.find(p => p.id === openId)
  const athleteName = id => athletes.find(a => a.id === id)?.name

  if (plan) return (
    <>
      <PlanEditor key={plan.id} plan={plan} athletes={athletes} getAthleteZones={getAthleteZones} showToast={showToast}
        onBack={() => { setOpenId(null); load() }} onChange={p => setPlans(ps => ps.map(x => x.id === p.id ? p : x))}
        onPublished={onPublished} onOpen={id => { load().then(() => setOpenId(id)) }} setPrintData={setPrintData} />
      <PrintSheet data={printData} />
    </>
  )

  const templates = plans.filter(p => !p.athlete_id)
  const mine = plans.filter(p => p.athlete_id)

  return (
    <div className="view-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Plans IA</div>
          <div className="page-sub">Décris l'objectif, l'IA construit le plan avec ta méthode. Tu valides, tu ajustes, tu publies.</div>
        </div>
        <button className="btn-lime" onClick={() => setCreating(true)}>✦ Nouveau plan</button>
      </div>

      {mine.length === 0 && templates.length === 0 && (
        <div className="card ai-glow" style={{ padding: 28, textAlign: 'center' }}>
          <div className="display" style={{ fontSize: 34, marginBottom: 8 }}>Premier plan en 2 minutes</div>
          <p className="muted" style={{ maxWidth: 460, margin: '0 auto 18px' }}>Choisis un athlète et sa course. L'IA propose les phases semaine par semaine, puis détaille chaque séance dans tes zones Smart Pace.</p>
          <button className="btn-lime" onClick={() => setCreating(true)}>✦ Créer un plan</button>
        </div>
      )}

      {mine.length > 0 && <div style={{ display: 'grid', gap: 10 }}>{mine.map(p => <PlanRow key={p.id} p={p} who={athleteName(p.athlete_id)} onOpen={() => setOpenId(p.id)} />)}</div>}

      {templates.length > 0 && (
        <>
          <div className="section-title">Modèles réutilisables</div>
          <div style={{ display: 'grid', gap: 10 }}>{templates.map(p => <PlanRow key={p.id} p={p} who="Modèle" onOpen={() => setOpenId(p.id)} />)}</div>
        </>
      )}

      {creating && <NewPlanModal athletes={athletes} raceGoals={raceGoals} initialAthleteId={startWith} showToast={showToast}
        onClose={() => setCreating(false)} onCreated={id => { setCreating(false); load().then(() => setOpenId(id)) }} />}
    </div>
  )
}

function PlanRow({ p, who, onOpen }) {
  const weeks = p.outline?.length || 0
  const detailed = (p.weeks || []).length
  const km = (p.outline || []).map(w => w.target_km || 0)
  const max = Math.max(10, ...km)
  return (
    <div className="card card-hover" onClick={onOpen} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
        <div className="muted" style={{ fontSize: 13 }}>{who || '—'} · {weeks} semaines · {detailed < weeks ? `${detailed}/${weeks} détaillées` : 'complet'}</div>
      </div>
      <div className="phase-strip mob-hide" style={{ width: 160, height: 34 }}>
        {(p.outline || []).map((w, i) => <div key={i} style={{ height: `${(w.target_km / max) * 100}%`, background: phaseColor(w.phase) }} />)}
      </div>
      <span className="pill" style={{ background: p.status === 'published' ? 'var(--lime-glow)' : 'rgba(255,255,255,.05)', color: p.status === 'published' ? 'var(--lime)' : 'var(--text-3)' }}>{p.status === 'published' ? 'Publié' : 'Brouillon'}</span>
    </div>
  )
}

// ── Création : paramètres → structure IA ──
function NewPlanModal({ athletes, raceGoals, initialAthleteId, onClose, onCreated, showToast }) {
  const firstAth = initialAthleteId || athletes[0]?.id || ''
  const goalsOf = id => raceGoals.filter(g => g.athlete_id === id && g.date >= isoDate(new Date())).sort((a, b) => a.date.localeCompare(b.date))
  const g0 = goalsOf(firstAth)[0]
  const [f, setF] = useState({
    athlete_id: firstAth, goal_id: g0?.id || '', race_name: g0?.name || '', race_distance: g0?.distance || '', race_date: g0?.date || '', target_time: g0?.target_time || '',
    start_week: nextMonday(), level: 'intermédiaire', sessions_per_week: 4, days: [1, 3, 5, 6], long_run_day: 6,
    current_km: '', peak_km: '', strength: true, constraints: '', method: loadMethod(),
  })
  const [showMethod, setShowMethod] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const weeks = f.race_date && f.start_week ? weeksBetween(f.start_week, f.race_date) : 0

  const pickAthlete = id => {
    const g = goalsOf(id)[0]
    setF(x => ({ ...x, athlete_id: id, goal_id: g?.id || '', race_name: g?.name || '', race_distance: g?.distance || '', race_date: g?.date || '', target_time: g?.target_time || '' }))
  }
  const pickGoal = id => {
    const g = raceGoals.find(x => x.id === id)
    setF(x => ({ ...x, goal_id: id, race_name: g?.name || '', race_distance: g?.distance || '', race_date: g?.date || '', target_time: g?.target_time || x.target_time }))
  }
  const toggleDay = d => set('days', f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d].sort())

  const create = async () => {
    if (!f.race_date) return showToast('Indique la date de la course', 'err')
    if (weeks < 2 || weeks > 40) return showToast('Le plan doit durer entre 2 et 40 semaines', 'err')
    if (f.days.length < f.sessions_per_week) return showToast(`Coche au moins ${f.sessions_per_week} jours disponibles`, 'err')
    try { localStorage.setItem('rr_method', f.method) } catch {}
    setBusy(true)
    try {
      const params = { ...f, weeks }
      const out = await api('ai', { action: 'outline', params }, { coach: true })
      const { data, error } = await supabase.from('training_plans').insert({
        athlete_id: f.athlete_id || null, goal_id: f.goal_id || null, name: out.name || `${f.race_name} — plan`,
        params: { ...params, summary: out.summary }, outline: out.weeks, weeks: [], start_week: f.start_week, status: 'draft',
      }).select().single()
      if (error) throw new Error(error.message)
      showToast('Structure prête ✓')
      onCreated(data.id)
    } catch (e) { showToast(e.message, 'err') }
    setBusy(false)
  }

  const goals = goalsOf(f.athlete_id)
  return (
    <Overlay onClose={busy ? () => {} : onClose} wide>
      <div className="modal-title">Nouveau plan</div>
      <div className="modal-cols">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid-2">
            <FG label="Athlète">
              <select className="input" value={f.athlete_id} onChange={e => pickAthlete(e.target.value)}>
                {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value="">— Modèle sans athlète —</option>
              </select>
            </FG>
            <FG label="Objectif enregistré">
              <select className="input" value={f.goal_id} onChange={e => pickGoal(e.target.value)}>
                <option value="">Saisie libre</option>
                {goals.map(g => <option key={g.id} value={g.id}>{g.name} — {new Date(g.date + 'T12:00').toLocaleDateString('fr-FR')}</option>)}
              </select>
            </FG>
          </div>
          <div className="grid-2">
            <FG label="Course"><input className="input" value={f.race_name} onChange={e => set('race_name', e.target.value)} placeholder="Marathon de Lyon" /></FG>
            <FG label="Distance"><input className="input" value={f.race_distance} onChange={e => set('race_distance', e.target.value)} placeholder="Marathon, 10 km, trail 30 km…" /></FG>
          </div>
          <div className="grid-3">
            <FG label="Date de course"><input className="input" type="date" value={f.race_date} onChange={e => set('race_date', e.target.value)} /></FG>
            <FG label="Début du plan (lundi)"><input className="input" type="date" value={f.start_week} onChange={e => set('start_week', isoDate(mondayOf(new Date(e.target.value + 'T12:00'))))} /></FG>
            <FG label="Temps visé"><input className="input" value={f.target_time} onChange={e => set('target_time', e.target.value)} placeholder="sub 3h" /></FG>
          </div>
          {weeks > 0 && <div className="muted" style={{ fontSize: 13 }}>Durée : <b style={{ color: 'var(--text)' }}>{weeks} semaines</b></div>}
          <FG label="Niveau">
            <div className="chips">{['débutant', 'intermédiaire', 'confirmé', 'élite'].map(l => <button key={l} className={`chip ${f.level === l ? 'on' : ''}`} onClick={() => set('level', l)}>{l}</button>)}</div>
          </FG>
          <FG label="Séances de course par semaine">
            <div className="chips">{[2, 3, 4, 5, 6, 7].map(n => <button key={n} className={`chip ${f.sessions_per_week === n ? 'on' : ''}`} onClick={() => set('sessions_per_week', n)}>{n}</button>)}</div>
          </FG>
          <FG label="Jours disponibles">
            <div className="chips">{DAYS.map((d, i) => <button key={i} className={`chip ${f.days.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>)}</div>
          </FG>
        </div>
        <div className="modal-side" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid-2">
            <FG label="Volume actuel (km/sem)"><input className="input" type="number" value={f.current_km} onChange={e => set('current_km', e.target.value)} placeholder="35" /></FG>
            <FG label="Volume max (km/sem)"><input className="input" type="number" value={f.peak_km} onChange={e => set('peak_km', e.target.value)} placeholder="70" /></FG>
          </div>
          <FG label="Sortie longue le">
            <select className="input" value={f.long_run_day} onChange={e => set('long_run_day', Number(e.target.value))}>{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
          </FG>
          <label className="check"><input type="checkbox" checked={f.strength} onChange={e => set('strength', e.target.checked)} /> Inclure du renforcement</label>
          <FG label="Contraintes, blessures, remarques">
            <textarea className="input" rows={4} value={f.constraints} onChange={e => set('constraints', e.target.value)} placeholder="Ex : sensible du tendon d'Achille, pas de piste le mardi, stage en altitude en novembre…" />
          </FG>
          <button className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowMethod(s => !s)}>{showMethod ? 'Masquer' : 'Voir / modifier'} ma méthode</button>
          {showMethod && <textarea className="input" rows={9} style={{ fontSize: 12.5 }} value={f.method} onChange={e => set('method', e.target.value)} />}
        </div>
      </div>
      <div className="modal-foot">
        <div className="muted" style={{ fontSize: 12.5 }}>{busy ? <span className="ai-thinking"><i /><i /><i /></span> : "Étape 1/2 : l'IA propose les phases. Tu les valides avant le détail."}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn-lime" onClick={create} disabled={busy}>{busy ? 'Réflexion…' : '✦ Générer la structure'}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ── Éditeur de plan ──
function PlanEditor({ plan: initial, athletes, getAthleteZones, showToast, onBack, onChange, onPublished, onOpen, setPrintData }) {
  const [plan, setPlan] = useState(initial)
  const [gen, setGen] = useState(null) // { done, total }
  const [openWeek, setOpenWeek] = useState(1)
  const [editDay, setEditDay] = useState(null) // { week, idx | null }
  const [dup, setDup] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const stopRef = useRef(false)
  const athlete = athletes.find(a => a.id === plan.athlete_id)
  const zones = getAthleteZones(athlete)
  const outline = plan.outline || []
  const weeksById = Object.fromEntries((plan.weeks || []).map(w => [w.week, w]))
  const maxKm = Math.max(10, ...outline.map(w => Math.max(w.target_km || 0, sumKm(weeksById[w.week]))))

  const planRef = useRef(initial)
  planRef.current = plan
  const save = async (patch) => {
    const next = { ...planRef.current, ...patch, updated_at: new Date().toISOString() }
    planRef.current = next
    setPlan(next); onChange(next)
    const { error } = await supabase.from('training_plans').update({ ...patch, updated_at: next.updated_at }).eq('id', plan.id)
    if (error) showToast('Sauvegarde impossible : ' + error.message, 'err')
    return next
  }

  const generate = async (only = null) => {
    const todo = only ? [only] : outline.map(w => w.week).filter(n => !weeksById[n])
    if (!todo.length) return showToast('Toutes les semaines sont déjà détaillées')
    stopRef.current = false
    setGen({ done: 0, total: todo.length })
    let current = planRef.current
    // lots de semaines consécutives (BATCH max)
    const batches = []
    for (const n of todo) {
      const last = batches[batches.length - 1]
      if (last && last.length < BATCH && n === last[last.length - 1] + 1) last.push(n); else batches.push([n])
    }
    for (const b of batches) {
      if (stopRef.current) break
      const from = b[0], to = b[b.length - 1]
      try {
        const done = (current.weeks || []).filter(w => w.week < from).sort((a, c) => a.week - c.week)
        const out = await api('ai', { action: 'weeks', params: { ...current.params, athlete_id: current.athlete_id, start_week: current.start_week }, outline, from, to, done }, { coach: true })
        const merged = [...(current.weeks || []).filter(w => !out.weeks.some(n => n.week === w.week)), ...out.weeks].sort((a, c) => a.week - c.week)
        current = await save({ weeks: merged })
        setGen(g => ({ ...g, done: g.done + b.length }))
        setOpenWeek(from)
      } catch (e) { showToast(e.message, 'err'); break }
    }
    setGen(null)
  }

  const updateWeek = (weekNum, days) => {
    const cur = planRef.current
    const others = (cur.weeks || []).filter(w => w.week !== weekNum)
    const base = (cur.weeks || []).find(w => w.week === weekNum) || { week: weekNum, week_key: addWeeks(cur.start_week, weekNum - 1) }
    return save({ weeks: [...others, { ...base, days: days.sort((a, b) => a.day_index - b.day_index) }].sort((a, b) => a.week - b.week) })
  }

  const updateOutline = (weekNum, patch) => save({ outline: (planRef.current.outline || []).map(w => w.week === weekNum ? { ...w, ...patch } : w) })

  const publish = async () => {
    if (!plan.athlete_id) return showToast("Un modèle n'a pas d'athlète : duplique-le d'abord pour un athlète", 'err')
    const weeks = plan.weeks || []
    if (!weeks.length) return showToast("Génère d'abord le détail des séances", 'err')
    const keys = weeks.map(w => w.week_key)
    const { data: existing } = await supabase.from('week_slots').select('id').eq('athlete_id', plan.athlete_id).in('week_key', keys)
    if (existing?.length && !confirm(`${existing.length} jour(s) déjà programmé(s) sur ces semaines seront remplacés. Continuer ?`)) return
    setPublishing(true)
    try {
      await supabase.from('sessions').delete().eq('plan_id', plan.id)
      await supabase.from('week_slots').delete().eq('athlete_id', plan.athlete_id).in('week_key', keys)
      const rows = [], meta = []
      for (const w of weeks) for (const d of w.days || []) {
        rows.push({ name: d.name || SESSION_TYPES.find(t => t.id === d.session_type)?.label, session_type: d.session_type, description: d.description || '', notes: '', blocks: d.blocks || [], km: d.km || 0, plan_id: plan.id })
        meta.push({ w, d })
      }
      const { data: created, error } = await supabase.from('sessions').insert(rows).select('id')
      if (error) throw error
      const slots = meta.map(({ w, d }, i) => ({ athlete_id: plan.athlete_id, week_key: w.week_key, day_index: d.day_index, session_type: d.session_type, session_id: created[i].id, km: d.km || 0, note: [d.note, d.with_strength ? '💪 + renforcement' : ''].filter(Boolean).join('\n') }))
      const { error: e2 } = await supabase.from('week_slots').upsert(slots, { onConflict: 'athlete_id,week_key,day_index' })
      if (e2) throw e2
      await save({ status: 'published' })
      showToast(`Plan publié : ${slots.length} séances dans le planning ✓`)
      onPublished?.()
    } catch (e) { showToast('Publication impossible : ' + (e.message || e), 'err') }
    setPublishing(false)
  }

  const duplicate = async ({ athleteId, startWeek }) => {
    const target = athletes.find(a => a.id === athleteId)
    const tZones = getAthleteZones(target)
    const shift = w => addWeeks(startWeek, w - 1)
    const copy = {
      athlete_id: athleteId || null, goal_id: null, name: athleteId ? `${plan.name} — ${target?.name}` : `${plan.name} (modèle)`,
      params: { ...plan.params, athlete_id: athleteId || null, start_week: startWeek }, start_week: startWeek, status: 'draft',
      outline: outline.map(w => ({ ...w, week_key: shift(w.week) })),
      weeks: (plan.weeks || []).map(w => ({ ...w, week_key: shift(w.week), days: (w.days || []).map(d => ({ ...d, km: calcTotalDistance(d.blocks || [], tZones) || d.km })) })),
    }
    const { data, error } = await supabase.from('training_plans').insert(copy).select().single()
    if (error) return showToast(error.message, 'err')
    setDup(false)
    showToast(athleteId ? `Plan copié pour ${target?.name} — les allures sont recalculées ✓` : 'Modèle enregistré ✓')
    onOpen(data.id)
  }

  const remove = async () => {
    if (!confirm('Supprimer ce plan ? (les séances déjà publiées seront retirées du planning)')) return
    await supabase.from('sessions').delete().eq('plan_id', plan.id)
    await supabase.from('training_plans').delete().eq('id', plan.id)
    showToast('Plan supprimé'); onPublished?.(); onBack()
  }

  const exportPdf = () => printPlan(setPrintData, {
    title: plan.name, athlete: athlete?.name, zones, summary: plan.params?.summary,
    subtitle: plan.params?.race_date ? `${plan.params.race_name || ''} · ${new Date(plan.params.race_date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : '',
    weeks: outline.map(o => ({ ...(weeksById[o.week] || { days: [], pending: true }), week: o.week, week_key: o.week_key, phase: o.phase, focus: o.focus, target_km: o.target_km, label: `Semaine ${o.week}` })),
  })

  const detailed = (plan.weeks || []).length
  return (
    <div className="view-enter">
      <button className="btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 16 }}>← Plans</button>
      <div className="page-head">
        <div style={{ minWidth: 0, flex: '1 1 420px' }}>
          <input className="page-title" value={plan.name} onChange={e => setPlan(p => ({ ...p, name: e.target.value }))} onBlur={e => save({ name: e.target.value })}
            style={{ background: 'none', border: 'none', outline: 'none', width: '100%', color: '#fff' }} aria-label="Nom du plan" />
          <div className="page-sub">{athlete?.name || 'Modèle'} · {outline.length} semaines · début {new Date(plan.start_week + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}{plan.status === 'published' ? ' · publié' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={exportPdf}>Exporter PDF</button>
          <button className="btn-ghost" onClick={() => setDup(true)}>Dupliquer</button>
          <button className="btn-primary" onClick={publish} disabled={publishing || !!gen}>{publishing ? 'Publication…' : plan.status === 'published' ? 'Republier' : 'Publier dans le planning'}</button>
        </div>
      </div>

      {plan.params?.summary && <div className="card" style={{ marginBottom: 16, color: 'var(--text-2)', lineHeight: 1.6 }}>{plan.params.summary}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="phase-strip" style={{ height: 90 }}>
          {outline.map(w => {
            const real = sumKm(weeksById[w.week])
            return (
              <div key={w.week} title={`S${w.week} · ${w.phase} · ${w.target_km} km`} onClick={() => setOpenWeek(w.week)}
                style={{ height: `${(Math.max(w.target_km, real) / maxKm) * 100}%`, background: phaseColor(w.phase), opacity: openWeek === w.week ? 1 : weeksById[w.week] ? .85 : .35, cursor: 'pointer', outline: openWeek === w.week ? '2px solid #fff' : 'none', outlineOffset: 1 }} />
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontSize: 12 }}>
          {[...new Set(outline.map(w => w.phase))].map(p => <span key={p} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--text-3)' }}><span className="dot" style={{ background: phaseColor(p) }} />{p}</span>)}
        </div>
      </div>

      {gen ? (
        <div className="card ai-glow" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span className="ai-thinking"><i /><i /><i /></span> L'IA détaille les séances… {gen.done}/{gen.total} semaines</div>
            <button className="btn-ghost btn-sm" onClick={() => { stopRef.current = true }}>Arrêter après ce lot</button>
          </div>
          <div className="progress"><div style={{ width: `${(gen.done / gen.total) * 100}%` }} /></div>
        </div>
      ) : detailed < outline.length && (
        <div className="card ai-glow" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div><b>Étape 2/2 — détail des séances.</b> <span className="muted">Vérifie la structure ci-dessous (phases, volumes), puis lance le détail. Compte ~1 min pour 2 semaines.</span></div>
          <button className="btn-lime" onClick={() => generate()}>✦ Générer {detailed ? `les ${outline.length - detailed} semaines restantes` : 'toutes les séances'}</button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {outline.map(o => (
          <WeekCard key={o.week} o={o} w={weeksById[o.week]} zones={zones} open={openWeek === o.week} busy={!!gen}
            onToggle={() => setOpenWeek(openWeek === o.week ? null : o.week)}
            onOutline={patch => updateOutline(o.week, patch)}
            onRegenerate={() => generate(o.week)}
            onEditDay={idx => setEditDay({ week: o.week, idx })}
            onDeleteDay={idx => updateWeek(o.week, (weeksById[o.week]?.days || []).filter((_, i) => i !== idx))} />
        ))}
      </div>

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-danger" onClick={remove}>Supprimer le plan</button>
      </div>

      {editDay && (
        <DayModal zones={zones} athleteId={plan.athlete_id} method={plan.params?.method}
          day={editDay.idx !== null ? weeksById[editDay.week]?.days?.[editDay.idx] : null}
          takenDays={(weeksById[editDay.week]?.days || []).filter((_, i) => i !== editDay.idx).map(d => d.day_index)}
          onClose={() => setEditDay(null)} showToast={showToast}
          onSave={d => {
            const days = [...(weeksById[editDay.week]?.days || [])]
            if (editDay.idx !== null) days[editDay.idx] = d; else days.push(d)
            updateWeek(editDay.week, days); setEditDay(null)
          }} />
      )}
      {dup && <DuplicateModal athletes={athletes} current={plan} onClose={() => setDup(false)} onConfirm={duplicate} />}
    </div>
  )
}

const sumKm = w => Math.round((w?.days || []).reduce((s, d) => s + (Number(d.km) || 0), 0))

function WeekCard({ o, w, zones, open, busy, onToggle, onOutline, onRegenerate, onEditDay, onDeleteDay }) {
  const km = sumKm(w)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${phaseColor(o.phase)}` }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', gap: 14, alignItems: 'center', padding: '14px 18px', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <div className="display" style={{ fontSize: 26, width: 44, color: phaseColor(o.phase) }}>S{o.week}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{o.phase}{o.is_recovery ? ' · allégée' : ''} <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· {new Date(o.week_key + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span></div>
          <div className="muted" style={{ fontSize: 13, whiteSpace: open ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.focus}</div>
        </div>
        <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
          <div>{w ? `${km} km` : `~${o.target_km} km`}</div>
          <div className="muted" style={{ fontSize: 11 }}>{w ? `${w.days.length} séances` : 'à détailler'}</div>
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px' }}>
          <div className="grid-3" style={{ marginBottom: 12 }}>
            <FG label="Phase"><input className="input" defaultValue={o.phase} onBlur={e => e.target.value !== o.phase && onOutline({ phase: e.target.value })} /></FG>
            <FG label="Volume cible (km)"><input className="input" type="number" defaultValue={o.target_km} onBlur={e => Number(e.target.value) !== o.target_km && onOutline({ target_km: Number(e.target.value) })} /></FG>
            <FG label="Semaine allégée"><label className="check" style={{ height: 42 }}><input type="checkbox" checked={!!o.is_recovery} onChange={e => onOutline({ is_recovery: e.target.checked })} /> Oui</label></FG>
          </div>
          {(o.key_sessions || []).length > 0 && <div className="chips" style={{ marginBottom: 12 }}>{o.key_sessions.map((k, i) => <span key={i} className="tag">{k}</span>)}</div>}
          {w && (
            <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
              {w.days.map((d, i) => {
                const st = SESSION_TYPES.find(t => t.id === d.session_type)
                return (
                  <div key={i} className="panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => onEditDay(i)}>
                    <div style={{ width: 34, fontWeight: 600, color: st?.color, fontSize: 13 }}>{DAYS[d.day_index]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{d.name}{d.with_strength && <span style={{ color: '#f472b6' }}> · 💪</span>}</div>
                      <div className="muted num" style={{ fontSize: 11.5, marginTop: 2 }}>{blocksToText(d.blocks)}</div>
                      {d.note && <div style={{ fontSize: 12, color: 'var(--lime)', marginTop: 3 }}>{d.note}</div>}
                    </div>
                    <div className="num" style={{ fontSize: 12.5 }}>{d.km ? `${d.km} km` : ''}</div>
                    <button className="icon-btn" aria-label="Supprimer" onClick={e => { e.stopPropagation(); onDeleteDay(i) }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-ghost btn-sm" onClick={() => onEditDay(null)}>+ Ajouter une séance</button>
            <button className="btn-ghost btn-sm" style={{ color: 'var(--lime)' }} disabled={busy} onClick={onRegenerate}>✦ {w ? 'Régénérer' : 'Générer'} cette semaine</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DayModal({ day, zones, takenDays, athleteId, method, onClose, onSave, showToast }) {
  const free = [0, 1, 2, 3, 4, 5, 6].find(i => !takenDays.includes(i)) ?? 0
  const [d, setD] = useState(day || { day_index: free, session_type: 'EF', name: '', description: '', note: '', blocks: [], km: 0, with_strength: false })
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const km = calcTotalDistance(d.blocks || [], zones)
  const aiFill = async () => {
    if (!prompt.trim()) return
    setBusy(true)
    try {
      const s = await api('ai', { action: 'session', text: prompt, athlete_id: athleteId, method }, { coach: true })
      setD(x => ({ ...x, name: s.name, session_type: s.session_type, description: s.description, blocks: s.blocks }))
      setPrompt('')
    } catch (e) { showToast(e.message, 'err') }
    setBusy(false)
  }
  const draft = { ...d, blocks: d.blocks || [] }
  return (
    <Overlay onClose={onClose} wide>
      <div className="modal-title">{day ? 'Modifier la séance' : 'Nouvelle séance'}</div>
      <div className="panel ai-glow" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <input className="input" value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && aiFill()} placeholder="✦ Décris la séance : « 3×15 min au seuil, récup 3 min »" />
        <button className="btn-lime" onClick={aiFill} disabled={busy}>{busy ? '…' : 'Créer'}</button>
      </div>
      <div className="modal-cols">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid-2">
            <FG label="Jour"><select className="input" value={d.day_index} onChange={e => setD(x => ({ ...x, day_index: Number(e.target.value) }))}>{DAYS.map((n, i) => <option key={i} value={i} disabled={takenDays.includes(i)}>{n}</option>)}</select></FG>
            <FG label="Type"><select className="input" value={d.session_type} onChange={e => setD(x => ({ ...x, session_type: e.target.value }))}>{SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></FG>
          </div>
          <FG label="Nom"><input className="input" value={d.name} onChange={e => setD(x => ({ ...x, name: e.target.value }))} /></FG>
          <FG label="Description"><textarea className="input" rows={3} value={d.description} onChange={e => setD(x => ({ ...x, description: e.target.value }))} /></FG>
          <FG label="Consigne pour l'athlète"><textarea className="input" rows={2} value={d.note || ''} onChange={e => setD(x => ({ ...x, note: e.target.value }))} /></FG>
          <label className="check"><input type="checkbox" checked={!!d.with_strength} onChange={e => setD(x => ({ ...x, with_strength: e.target.checked }))} /> + renforcement ce jour-là</label>
          {km > 0 && <div style={{ color: 'var(--lime)', fontSize: 13 }}>≈ {km} km</div>}
        </div>
        <div className="modal-side"><SessionBuilder draft={draft} setDraft={fn => setD(x => { const n = typeof fn === 'function' ? fn({ ...x, blocks: x.blocks || [] }) : fn; return { ...x, blocks: n.blocks } })} zones={zones} /></div>
      </div>
      <div className="modal-foot">
        <span />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={() => onSave({ ...d, km: km || Number(d.km) || 0, name: d.name || SESSION_TYPES.find(t => t.id === d.session_type)?.label })}>Enregistrer</button>
        </div>
      </div>
    </Overlay>
  )
}

function DuplicateModal({ athletes, current, onClose, onConfirm }) {
  const [athleteId, setAthleteId] = useState(athletes.find(a => a.id !== current.athlete_id)?.id || '')
  const [startWeek, setStartWeek] = useState(current.start_week || nextMonday())
  return (
    <Overlay onClose={onClose}>
      <div className="modal-title">Dupliquer le plan</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FG label="Pour">
          <select className="input" value={athleteId} onChange={e => setAthleteId(e.target.value)}>
            {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="">Enregistrer comme modèle (sans athlète)</option>
          </select>
        </FG>
        <FG label="Début (lundi)"><input className="input" type="date" value={startWeek} onChange={e => setStartWeek(isoDate(mondayOf(new Date(e.target.value + 'T12:00'))))} /></FG>
        <div className="muted" style={{ fontSize: 13 }}>Les séances restent en zones Smart Pace : les allures et les kilomètres sont recalculés automatiquement pour le nouvel athlète. Tu peux ensuite régénérer des semaines avec l'IA pour l'adapter à son historique.</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={() => onConfirm({ athleteId, startWeek })}>Dupliquer</button>
        </div>
      </div>
    </Overlay>
  )
}
