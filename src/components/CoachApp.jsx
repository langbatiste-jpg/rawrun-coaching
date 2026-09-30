import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { api } from '../api'
import { getWeekKey, generateTCX, downloadTCX, daysUntil, isoDate } from '../utils'
import { SESSION_TYPES, DAYS, BASE_ZONES, RECORD_DISTANCES } from '../constants'
import { athleteZones, calcTotalDistance, blocksToText, addWeeks } from '../../shared/training.js'
import { athleteAlerts, loadRatio, ALERT_COLORS } from '../lib/insights'
import { Overlay, FG, WeekNav } from './ui'
import Icon from './Icon'
import Wordmark from './Wordmark'
import ChatModal from './ChatModal'
import MonthCalendar from './MonthCalendar'
import SessionBuilder from './SessionBuilder'
import { ExerciseLibrary, StrengthSessionBuilder } from './StrengthBuilder'
import { WellnessChart } from './WellnessCheck'
import LoadChart from './LoadChart'
import PlanStudio from './PlanStudio'
import InstallApp from './InstallApp'
import MethodPage from './MethodPage'
import ShopAdmin from './ShopAdmin'
import ComptaPage from './ComptaPage'
import PrintSheet, { printPlan } from './PrintSheet'
import SessionBar from './SessionBar'
export { SessionBar }

const NAV = [
  ['dashboard', 'Vue globale', 'dashboard'],
  ['planning', 'Planning', 'planning'],
  ['plans', 'Plans IA', 'ai'],
  ['method', 'Ma méthode', 'method'],
  ['athletes', 'Athlètes', 'athletes'],
  ['sessions', 'Séances', 'sessions'],
  ['strength', 'Renforcement', 'strength'],
  ['goals', 'Objectifs', 'goals'],
  ['shop', 'Boutique', 'shop'],
  ['compta', 'Compta', 'compta'],
  ['notifications', 'Notifications', 'notifications'],
]
const MOBILE_NAV = ['dashboard', 'planning', 'plans', 'athletes', 'more']
const stType = id => SESSION_TYPES.find(t => t.id === id)

export default function CoachApp({ onLogout, showToast }) {
  const [view, setView] = useState('dashboard')
  const [calMode, setCalMode] = useState('week')
  const [athletes, setAthletes] = useState([])
  const [sessions, setSessions] = useState([])
  const [strengthSessions, setStrengthSessions] = useState([])
  const [exercises, setExercises] = useState([])
  const [completions, setCompletions] = useState({})
  const [notifications, setNotifications] = useState([])
  const [weekData, setWeekData] = useState({})
  const [raceGoals, setRaceGoals] = useState([])
  const [wellness, setWellness] = useState([])
  const [modal, setModal] = useState(null)
  const [editAthlete, setEditAthlete] = useState(null)
  const [editSession, setEditSession] = useState(null)
  const [editStrengthSession, setEditStrengthSession] = useState(null)
  const [editSlot, setEditSlot] = useState(null)
  const [editGoal, setEditGoal] = useState(null)
  const [chatTarget, setChatTarget] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)
  const [dragSlot, setDragSlot] = useState(null)
  const [planFor, setPlanFor] = useState(null)
  const [printData, setPrintData] = useState(null)
  const weekKey = getWeekKey(weekOffset)
  const unread = notifications.filter(n => !n.read).length

  useEffect(() => {
    loadAll()
    // Vérifie que le compte connecté est bien déclaré comme coach (table coaches)
    supabase.rpc('is_coach').then(({ data, error }) => {
      if (error) showToast('Base pas à jour : lance supabase/migration_v7.sql (voir guide)', 'err')
      else if (data === false) showToast("Ce compte n'est pas coach : son email doit être dans la table coaches", 'err')
    })
  }, [])
  useEffect(() => {
    const ch = supabase.channel('coach_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, loadNotifications)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'completions' }, () => { loadNotifications(); loadCompletions() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wellness' }, loadWellness)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])
  useEffect(() => { if (!selectedAthleteId && athletes[0]) setSelectedAthleteId(athletes[0].id) }, [athletes])

  const loadAll = () => Promise.all([loadAthletes(), loadSessions(), loadStrengthSessions(), loadExercises(), loadNotifications(), loadCompletions(), loadWeekData(), loadRaceGoals(), loadWellness()])
  const loadAthletes = async () => { const { data } = await supabase.from('athletes').select('*').order('name'); setAthletes(data || []) }
  const loadSessions = async () => { const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: false }); setSessions(data || []) }
  const loadStrengthSessions = async () => { const { data } = await supabase.from('strength_sessions').select('*').order('created_at', { ascending: false }); setStrengthSessions(data || []) }
  const loadExercises = async () => { const { data } = await supabase.from('exercises').select('*').order('name'); setExercises(data || []) }
  const loadNotifications = async () => { const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60); setNotifications(data || []) }
  const loadCompletions = async () => { const { data } = await supabase.from('completions').select('*'); const map = {}; data?.forEach(c => { map[c.session_key] = c }); setCompletions(map) }
  const loadWeekData = async () => { const { data } = await supabase.from('week_slots').select('*'); const map = {}; data?.forEach(s => { map[`${s.athlete_id}__${s.week_key}__${s.day_index}`] = s }); setWeekData(map) }
  const loadRaceGoals = async () => { const { data } = await supabase.from('race_goals').select('*').order('date'); setRaceGoals(data || []) }
  const loadWellness = async () => { const since = new Date(); since.setDate(since.getDate() - 21); const { data } = await supabase.from('wellness').select('*').gte('date', isoDate(since)); setWellness(data || []) }

  const getSlot = (athleteId, wk, dayIdx) => weekData[`${athleteId}__${wk}__${dayIdx}`] || null
  const getAthleteWeek = (athleteId, wk) => DAYS.map((_, i) => getSlot(athleteId, wk, i))
  const getAthleteZones = a => athleteZones(a)
  const markAllRead = async () => { await supabase.from('notifications').update({ read: true }).eq('read', false); loadNotifications() }
  const openChat = (athleteId, sessionKey, sessionName) => {
    const athlete = athletes.find(a => a.id === athleteId)
    setChatTarget({ athleteId, sessionKey, sessionName, athleteName: athlete?.name })
    supabase.from('notifications').update({ read: true }).eq('session_key', sessionKey).then(loadNotifications)
  }
  const go = v => { setView(v); window.scrollTo({ top: 0 }) }
  const openPlanner = id => { setSelectedAthleteId(id); go('planning') }
  const newPlanFor = id => { setPlanFor(id); go('plans') }

  const handleDragStart = (e, info) => { setDragSlot(info); e.dataTransfer.effectAllowed = 'move' }
  const handleDrop = async (e, targetDayIdx) => {
    e.preventDefault()
    if (!dragSlot || dragSlot.dayIdx === targetDayIdx) return
    const { athleteId, weekKey: wk, dayIdx: srcIdx, slot } = dragSlot
    const target = getSlot(athleteId, wk, targetDayIdx)
    await supabase.from('week_slots').delete().match({ athlete_id: athleteId, week_key: wk, day_index: srcIdx })
    if (target) await supabase.from('week_slots').upsert({ ...target, id: undefined, day_index: srcIdx }, { onConflict: 'athlete_id,week_key,day_index' })
    await supabase.from('week_slots').upsert({ ...slot, id: undefined, day_index: targetDayIdx }, { onConflict: 'athlete_id,week_key,day_index' })
    setDragSlot(null); loadWeekData(); showToast(target ? 'Séances échangées ✓' : 'Séance déplacée ✓')
  }
  const duplicateToAll = async (wk, dayIdx) => {
    const src = getSlot(selectedAthleteId, wk, dayIdx)
    if (!src) return showToast('Aucune séance à dupliquer', 'err')
    if (!confirm(`Copier cette séance à tous les autres athlètes (${athletes.length - 1}) ?`)) return
    const rows = athletes.filter(a => a.id !== selectedAthleteId).map(a => ({ ...src, id: undefined, created_at: undefined, athlete_id: a.id }))
    await supabase.from('week_slots').upsert(rows, { onConflict: 'athlete_id,week_key,day_index' })
    loadWeekData(); showToast(`Séance copiée sur ${rows.length} athlètes ✓`)
  }
  const copyWeekToNext = async () => {
    const src = getAthleteWeek(selectedAthleteId, weekKey).filter(Boolean)
    if (!src.length) return showToast('Semaine vide', 'err')
    const next = addWeeks(weekKey, 1)
    const hasNext = getAthleteWeek(selectedAthleteId, next).some(Boolean)
    if (hasNext && !confirm('La semaine suivante contient déjà des séances. Les remplacer ?')) return
    await supabase.from('week_slots').delete().match({ athlete_id: selectedAthleteId, week_key: next })
    await supabase.from('week_slots').insert(src.map(s => ({ ...s, id: undefined, created_at: undefined, week_key: next })))
    loadWeekData(); setWeekOffset(o => o + 1); showToast('Semaine copiée ✓')
  }
  const exportWeeks = () => {
    const a = athletes.find(x => x.id === selectedAthleteId); if (!a) return
    const weeks = [0, 1, 2, 3].map(i => {
      const wk = addWeeks(weekKey, i)
      const days = getAthleteWeek(a.id, wk).map((s, d) => {
        if (!s || s.session_type === 'REPOS') return null
        const sess = sessions.find(x => x.id === s.session_id)
        return { day_index: d, session_type: s.session_type, name: sess?.name, description: sess?.description, blocks: sess?.blocks || [], km: s.km, note: s.note }
      }).filter(Boolean)
      return { week_key: wk, label: `Semaine ${i + 1}`, days }
    })
    printPlan(setPrintData, { title: 'Programme', athlete: a.name, subtitle: '4 semaines', zones: getAthleteZones(a), weeks })
  }

  const libSessions = sessions.filter(s => !s.plan_id)
  const titles = Object.fromEntries(NAV.map(([v, l]) => [v, l]))

  return (
    <div className="rr-shell">
      <header className="rr-topbar">
        <Wordmark />
        <div style={{ flex: 1 }} />
        <button className="icon-btn" style={{ position: 'relative' }} aria-label="Notifications" onClick={() => { go('notifications'); markAllRead() }}>
          <Icon name="notifications" />{unread > 0 && <span className="notif-dot" style={{ position: 'absolute', top: 2, right: 2 }} />}
        </button>
      </header>

      <nav className="rr-nav" aria-label="Navigation coach">
        <Wordmark />
        <span className="rr-nav-role">Espace coach</span>
        {NAV.map(([v, l, ic]) => (
          <button key={v} className={`rr-nav-btn ${view === v ? 'active' : ''} ${v === 'plans' ? 'ai' : ''} ${MOBILE_NAV.includes(v) ? '' : 'desk-only'}`}
            onClick={() => { go(v); if (v === 'notifications') markAllRead() }}>
            <Icon name={ic} />{l}{v === 'notifications' && unread > 0 && <span className="badge">{unread}</span>}
          </button>
        ))}
        <button className={`rr-nav-btn mob-only ${view === 'more' ? 'active' : ''}`} onClick={() => go('more')}><Icon name="sessions" />Plus</button>
        <div className="rr-nav-spacer" />
        <button className="rr-nav-btn desk-only" onClick={onLogout}><Icon name="logout" />Déconnexion</button>
      </nav>

      <main className="rr-main">
        <div className="rr-content" key={view}>
          {view === 'dashboard' && <Dashboard {...{ athletes, weekKey, weekOffset, setWeekOffset, getAthleteWeek, completions, weekData, notifications, raceGoals, wellness, openPlanner, newPlanFor, openChat }} />}
          {view === 'athletes' && <Athletes {...{ athletes, raceGoals, completions, weekData, getAthleteZones, showToast, openPlanner, newPlanFor }} onAdd={() => { setEditAthlete(null); setModal('athlete') }} onEdit={a => { setEditAthlete(a); setModal('athlete') }} onDelete={loadAthletes} />}
          {view === 'sessions' && <Sessions sessions={libSessions} showToast={showToast} onAdd={(prefill = null) => { setEditSession(prefill); setModal('session') }} onEdit={s => { setEditSession(s); setModal('session') }} onDelete={loadSessions} />}
          {view === 'strength' && <Strength strengthSessions={strengthSessions} onAdd={() => { setEditStrengthSession(null); setModal('strength') }} onEdit={s => { setEditStrengthSession(s); setModal('strength') }} onLibrary={() => setModal('exercises')} />}
          {view === 'planning' && (
            <Planning {...{ athletes, sessions, strengthSessions, weekKey, weekOffset, setWeekOffset, selectedAthleteId, setSelectedAthleteId, getAthleteWeek, getSlot, completions, notifications, openChat, calMode, setCalMode, raceGoals, handleDragStart, handleDrop, duplicateToAll, copyWeekToNext, exportWeeks, newPlanFor }}
              onEditSlot={s => { setEditSlot(s); setModal('slot') }} />
          )}
          {view === 'plans' && <PlanStudio athletes={athletes} raceGoals={raceGoals} getAthleteZones={getAthleteZones} showToast={showToast} onPublished={() => { loadWeekData(); loadSessions() }} startWith={planFor} key={planFor || 'plans'} />}
          {view === 'method' && <MethodPage showToast={showToast} />}
          {view === 'shop' && <ShopAdmin showToast={showToast} />}
          {view === 'compta' && <ComptaPage showToast={showToast} />}
          {view === 'goals' && <Goals athletes={athletes} raceGoals={raceGoals} onAdd={() => { setEditGoal(null); setModal('goal') }} onEdit={g => { setEditGoal(g); setModal('goal') }} onDelete={loadRaceGoals} showToast={showToast} />}
          {view === 'notifications' && <Notifications notifications={notifications} athletes={athletes} openChat={openChat} go={go} />}
          {view === 'more' && (
            <div className="view-enter">
              <div className="page-title" style={{ marginBottom: 20 }}>Menu</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <InstallApp />
                {NAV.filter(([v]) => !MOBILE_NAV.includes(v)).map(([v, l, ic]) => (
                  <button key={v} className="card card-hover" style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--text)', fontSize: 15, textAlign: 'left' }} onClick={() => { go(v); if (v === 'notifications') markAllRead() }}>
                    <Icon name={ic} />{l}{v === 'notifications' && unread > 0 && <span className="pill" style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'var(--accent-ink)' }}>{unread}</span>}
                  </button>
                ))}
                <button className="card card-hover" style={{ display: 'flex', gap: 12, alignItems: 'center', color: 'var(--danger)', fontSize: 15 }} onClick={onLogout}><Icon name="logout" />Déconnexion</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {modal === 'athlete' && <ModalAthlete editAthlete={editAthlete} setModal={setModal} onSaved={loadAthletes} showToast={showToast} />}
      {modal === 'session' && <ModalSession editSession={editSession} setModal={setModal} onSaved={loadSessions} showToast={showToast} />}
      {modal === 'strength' && <ModalStrengthSession editSession={editStrengthSession} exercises={exercises} setModal={setModal} onSaved={loadStrengthSessions} showToast={showToast} />}
      {modal === 'exercises' && <Overlay onClose={() => setModal(null)} wide><ExerciseLibrary exercises={exercises} onAdd={loadExercises} onEdit={loadExercises} onDelete={loadExercises} showToast={showToast} /></Overlay>}
      {modal === 'slot' && editSlot && <ModalSlot slot={editSlot} sessions={libSessions} allSessions={sessions} strengthSessions={strengthSessions} athletes={athletes} setModal={setModal} onSaved={() => { loadWeekData(); loadSessions() }} showToast={showToast} />}
      {modal === 'goal' && <ModalGoal editGoal={editGoal} athletes={athletes} setModal={setModal} onSaved={loadRaceGoals} showToast={showToast} />}
      {chatTarget && <ChatModal {...chatTarget} isCoach completion={completions[chatTarget.sessionKey]} onClose={() => setChatTarget(null)} />}
      <PrintSheet data={printData} />
    </div>
  )
}

// ─────────── VUE GLOBALE ───────────
function Dashboard({ athletes, weekKey, weekOffset, setWeekOffset, getAthleteWeek, completions, weekData, notifications, raceGoals, wellness, openPlanner, newPlanFor }) {
  const totalKm = Math.round(athletes.reduce((acc, a) => acc + getAthleteWeek(a.id, weekKey).reduce((s, d) => s + (Number(d?.km) || 0), 0), 0))
  const planned = athletes.reduce((acc, a) => acc + getAthleteWeek(a.id, weekKey).filter(d => d && d.session_type !== 'REPOS').length, 0)
  const done = Object.keys(completions).filter(k => k.includes(`__${weekKey}__`)).length
  const upcoming = raceGoals.filter(g => daysUntil(g.date) >= 0 && daysUntil(g.date) <= 60)
  const alerts = useMemo(() => athletes.map(a => ({ a, list: athleteAlerts({ athlete: a, completions, weekData, wellness, raceGoals }) })), [athletes, completions, weekData, wellness, raceGoals])
  const urgent = alerts.flatMap(({ a, list }) => list.filter(x => x.level !== 'info').map(x => ({ ...x, a })))
  const hour = new Date().getHours()

  return (
    <div className="view-enter">
      <div className="page-head">
        <div>
          <div className="page-title">{hour < 12 ? 'Bonjour' : hour < 18 ? 'Salut' : 'Bonsoir'} coach</div>
          <div className="page-sub">{urgent.length ? `${urgent.length} point${urgent.length > 1 ? 's' : ''} à regarder aujourd'hui` : 'Rien d\'urgent, tout le monde roule.'}</div>
        </div>
        <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />
      </div>

      <div className="stats-grid">
        <div className="card"><div className="stat-val">{athletes.length}</div><div className="stat-label">athlètes suivis</div></div>
        <div className="card"><div className="stat-val">{totalKm}<small>km</small></div><div className="stat-label">programmés cette semaine</div></div>
        <div className="card"><div className="stat-val">{done}<small>/{planned}</small></div><div className="stat-label">séances validées</div></div>
        <div className="card"><div className="stat-val">{upcoming.length}</div><div className="stat-label">courses dans les 60 jours</div></div>
      </div>

      {urgent.length > 0 && (
        <>
          <div className="section-title">À surveiller</div>
          <div className="card" style={{ padding: 10, marginBottom: 8 }}>
            {urgent.map((x, i) => (
              <div key={i} className="alert-row" style={{ borderLeft: `3px solid ${ALERT_COLORS[x.level]}`, cursor: 'pointer' }} onClick={() => x.level === 'todo' ? newPlanFor(x.a.id) : openPlanner(x.a.id)}>
                <span style={{ fontSize: 17 }}>{x.icon}</span>
                <div style={{ flex: 1 }}><b>{x.a.name}</b> <span className="muted">— {x.text}</span></div>
                {x.level === 'todo' && <span className="pill" style={{ color: 'var(--lime)', background: 'var(--lime-glow)' }}>✦ Plan IA</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Semaine des athlètes</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {athletes.map(a => {
          const w = getAthleteWeek(a.id, weekKey)
          const km = Math.round(w.reduce((s, d) => s + (Number(d?.km) || 0), 0))
          const doneN = w.filter((_, i) => !!completions[`${a.id}__${weekKey}__${i}`]).length
          const plannedN = w.filter(d => d && d.session_type !== 'REPOS').length
          const hasUnread = notifications.some(n => n.athlete_id === a.id && !n.read)
          const race = raceGoals.filter(g => g.athlete_id === a.id && daysUntil(g.date) >= 0).sort((x, y) => x.date.localeCompare(y.date))[0]
          const { ratio } = loadRatio(a.id, completions, weekData)
          return (
            <div key={a.id} className="card card-hover" onClick={() => openPlanner(a.id)}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div className="avatar">{a.name.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>{hasUnread && <span className="notif-dot" />}</div>
                  <div className="muted" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{race ? `${race.name} dans ${daysUntil(race.date)} j` : a.goal || 'Pas de course prévue'}</div>
                </div>
                <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
                  <div>{km} km · {doneN}/{plannedN}</div>
                  {ratio !== null && <div style={{ fontSize: 11, color: ratio > 1.5 ? 'var(--danger)' : ratio > 1.3 ? 'var(--gold)' : 'var(--text-3)' }}>charge ×{ratio.toFixed(2)}</div>}
                </div>
              </div>
              <div className="week-strip">
                {w.map((d, i) => {
                  const comp = !!completions[`${a.id}__${weekKey}__${i}`]
                  const st = d?.session_type ? stType(d.session_type) : null
                  return <div key={i} className="week-strip-bar" title={`${DAYS[i]} ${st?.label || ''}`} style={{ background: comp ? 'var(--lime)' : st && d.session_type !== 'REPOS' ? st.color : 'var(--bg-4)', opacity: comp || !st ? 1 : .55 }} />
                })}
              </div>
            </div>
          )
        })}
        {!athletes.length && <div className="card muted" style={{ textAlign: 'center', padding: 32 }}>Ajoute ton premier athlète dans l'onglet Athlètes.</div>}
      </div>
    </div>
  )
}

// ─────────── ATHLÈTES ───────────
function Athletes({ athletes, raceGoals, completions, weekData, onAdd, onEdit, onDelete, showToast, getAthleteZones, openPlanner, newPlanFor }) {
  const [selectedId, setSelectedId] = useState(athletes[0]?.id || null)
  const [bilan, setBilan] = useState({})
  const [busy, setBusy] = useState(false)
  const selected = athletes.find(a => a.id === selectedId)

  const analyze = async () => {
    setBusy(true)
    try { const r = await api('ai', { action: 'analyze', athlete_id: selected.id, method: localStorage.getItem('rr_method') || undefined }, { coach: true }); setBilan(b => ({ ...b, [selected.id]: r })) }
    catch (e) { showToast(e.message, 'err') }
    setBusy(false)
  }
  const statusColor = { ok: 'var(--lime)', watch: 'var(--gold)', alert: 'var(--danger)' }

  return (
    <div className="view-enter">
      <div className="page-head">
        <div className="page-title">Athlètes</div>
        <button className="btn-primary" onClick={onAdd}>+ Ajouter</button>
      </div>
      <div className="athletes-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 20, alignItems: 'start' }}>
        <style>{`@media (max-width: 860px) { .athletes-layout { grid-template-columns: 1fr !important; } .athletes-list { display: flex !important; overflow-x: auto; gap: 8px; padding-bottom: 4px; } .athletes-list > * { flex-shrink: 0; } }`}</style>
        <div className="athletes-list" style={{ display: 'grid', gap: 8 }}>
          {athletes.map(a => (
            <button key={a.id} className="card card-hover" onClick={() => setSelectedId(a.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', color: 'var(--text)', borderColor: selectedId === a.id ? 'var(--accent)' : undefined }}>
              <div className="avatar">{a.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{a.goal || '—'}</div></div>
            </button>
          ))}
        </div>
        {selected && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div className="display" style={{ fontSize: 40 }}>{selected.name}</div>
                  <div className="muted">{selected.goal || 'Objectif non renseigné'} · code <b className="num" style={{ color: 'var(--text)' }}>{selected.code}</b></div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <button className="btn-ghost btn-sm" onClick={() => openPlanner(selected.id)}>Planning</button>
                  <button className="btn-lime btn-sm" onClick={() => newPlanFor(selected.id)}>✦ Plan IA</button>
                  <button className="btn-ghost btn-sm" onClick={() => onEdit(selected)}>Modifier</button>
                  <button className="btn-danger btn-sm" onClick={async () => { if (confirm(`Supprimer ${selected.name} et tout son historique ?`)) { await supabase.from('athletes').delete().eq('id', selected.id); onDelete(); setSelectedId(null) } }}>Supprimer</button>
                </div>
              </div>
              {selected.records?.length > 0 && <div className="chips" style={{ marginBottom: 14 }}>{selected.records.map((r, i) => <span key={i} className="tag">{r.distance} <b className="num" style={{ color: 'var(--text)' }}>{r.time}</b></span>)}</div>}
              <ZoneTable zones={getAthleteZones(selected)} />
            </div>

            <div className="card ai-glow">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <b>Bilan IA</b>
                <button className="btn-lime btn-sm" onClick={analyze} disabled={busy}>{busy ? <span className="ai-thinking"><i /><i /><i /></span> : bilan[selected.id] ? 'Actualiser' : '✦ Analyser'}</button>
              </div>
              {bilan[selected.id] ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 600, color: statusColor[bilan[selected.id].status] }}>{bilan[selected.id].headline}</div>
                  <p style={{ color: 'var(--text-2)', margin: '8px 0 10px', lineHeight: 1.6 }}>{bilan[selected.id].analysis}</p>
                  <ul style={{ paddingLeft: 18, color: 'var(--text)', display: 'grid', gap: 4 }}>{bilan[selected.id].suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              ) : <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Charge, régularité, ressentis et check-ins des 6 dernières semaines, résumés avec des ajustements concrets.</div>}
            </div>

            <LoadChart athleteId={selected.id} completions={completions} weekData={weekData} />
            <WellnessChart athleteId={selected.id} days={14} />
          </div>
        )}
      </div>
    </div>
  )
}

function ZoneTable({ zones }) {
  const known = zones.some(z => z.paceMax !== '—')
  if (!known) return <div className="muted" style={{ fontSize: 13 }}>Ajoute un record pour calculer les allures.</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px 16px' }}>
      {zones.map(z => (
        <div key={z.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '3px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: z.color, flexShrink: 0 }} />
          <span className="muted" style={{ width: 62 }}>Z{z.id} {z.short}</span>
          <span className="num">{z.paceMax}–{z.paceMin}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────── SÉANCES ───────────
function Sessions({ sessions, onAdd, onEdit, onDelete, showToast }) {
  const [q, setQ] = useState('')
  const [aiText, setAiText] = useState('')
  const [busy, setBusy] = useState(false)
  const list = sessions.filter(s => !q || `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()))
  const aiCreate = async () => {
    if (!aiText.trim()) return
    setBusy(true)
    try {
      const s = await api('ai', { action: 'session', text: aiText, method: localStorage.getItem('rr_method') || undefined }, { coach: true })
      onAdd({ name: s.name, session_type: s.session_type, description: s.description, blocks: s.blocks, km: s.km, _new: true })
      setAiText('')
    } catch (e) { showToast(e.message, 'err') }
    setBusy(false)
  }
  return (
    <div className="view-enter">
      <div className="page-head">
        <div><div className="page-title">Séances</div><div className="page-sub">{sessions.length} séances dans ta bibliothèque</div></div>
        <button className="btn-primary" onClick={() => onAdd()}>+ Créer à la main</button>
      </div>
      <div className="card ai-glow" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} value={aiText} onChange={e => setAiText(e.target.value)} onKeyDown={e => e.key === 'Enter' && aiCreate()} placeholder="✦ « 10×400 m en côte, récup descente trottinée » ou « SL 1h45 avec 3×20 min AS42 »" />
        <button className="btn-lime" onClick={aiCreate} disabled={busy}>{busy ? <span className="ai-thinking"><i /><i /><i /></span> : '✦ Construire'}</button>
      </div>
      <input className="input" style={{ marginBottom: 14, maxWidth: 320 }} placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {list.map(s => {
          const st = stType(s.session_type)
          return (
            <div key={s.id} className="card card-hover" onClick={() => onEdit(s)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 12.5, color: st?.color }}>{st?.label}</div></div>
                {s.km > 0 && <span className="tag num">{s.km} km</span>}
              </div>
              <SessionBar blocks={s.blocks || []} />
              {s.blocks?.length > 0 && <div className="muted num" style={{ fontSize: 11.5 }}>{blocksToText(s.blocks)}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="icon-btn" aria-label="Supprimer" onClick={async e => { e.stopPropagation(); if (confirm('Supprimer cette séance ?')) { await supabase.from('sessions').delete().eq('id', s.id); onDelete(); showToast('Séance supprimée') } }}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Strength({ strengthSessions, onAdd, onEdit, onLibrary }) {
  return (
    <div className="view-enter">
      <div className="page-head">
        <div className="page-title">Renforcement</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={onLibrary}>Exercices</button>
          <button className="btn-primary" onClick={onAdd}>+ Créer</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {strengthSessions.map(s => (
          <div key={s.id} className="card card-hover strength-card" onClick={() => onEdit(s)}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{s.description}</div>
            <div style={{ fontSize: 12, color: '#f472b6' }}>{(s.exercises || []).length} exercices</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────── PLANNING ───────────
function Planning({ athletes, sessions, strengthSessions, weekKey, weekOffset, setWeekOffset, selectedAthleteId, setSelectedAthleteId, getAthleteWeek, getSlot, completions, notifications, onEditSlot, openChat, calMode, setCalMode, raceGoals, handleDragStart, handleDrop, duplicateToAll, copyWeekToNext, exportWeeks, newPlanFor }) {
  const athlete = athletes.find(a => a.id === selectedAthleteId)
  const weekSlots = selectedAthleteId ? getAthleteWeek(selectedAthleteId, weekKey) : Array(7).fill(null)
  const km = Math.round(weekSlots.reduce((s, d) => s + (Number(d?.km) || 0), 0) * 10) / 10
  const zones = athleteZones(athlete)
  const [dragOver, setDragOver] = useState(null)
  const todayIdx = weekOffset === 0 ? (new Date().getDay() + 6) % 7 : -1
  const dateOf = i => { const d = new Date(weekKey + 'T12:00'); d.setDate(d.getDate() + i); return d.getDate() }

  return (
    <div className="view-enter">
      <div className="page-head">
        <div>
          <div className="page-title">Planning</div>
          <div className="page-sub">{athlete ? `${athlete.name} · ${km} km cette semaine` : 'Choisis un athlète'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tab-bar">{[['week', 'Semaine'], ['month', 'Mois']].map(([m, l]) => <button key={m} className={`tab-btn ${calMode === m ? 'active' : ''}`} onClick={() => setCalMode(m)}>{l}</button>)}</div>
          {calMode === 'week' && <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />}
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        {athletes.map(a => <button key={a.id} className={`chip ${selectedAthleteId === a.id ? 'on' : ''}`} onClick={() => setSelectedAthleteId(a.id)}>{a.name}</button>)}
      </div>
      {selectedAthleteId && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button className="btn-lime btn-sm" onClick={() => newPlanFor(selectedAthleteId)}>✦ Plan IA</button>
          {calMode === 'week' && <button className="btn-ghost btn-sm" onClick={copyWeekToNext}>Copier vers la semaine suivante</button>}
          <button className="btn-ghost btn-sm" onClick={exportWeeks}>Exporter PDF (4 semaines)</button>
        </div>
      )}

      {selectedAthleteId && calMode === 'week' && (
        <div className="week-grid">
          {DAYS.map((day, i) => {
            const slot = weekSlots[i]
            const st = slot?.session_type ? stType(slot.session_type) : null
            const sess = slot?.session_id ? sessions.find(s => s.id === slot.session_id) : null
            const ssess = slot?.strength_session_id ? strengthSessions.find(s => s.id === slot.strength_session_id) : null
            const compKey = `${selectedAthleteId}__${weekKey}__${i}`
            const comp = completions[compKey]
            const hasUnread = notifications.some(n => n.session_key === compKey && !n.read)
            const race = raceGoals.find(g => g.athlete_id === selectedAthleteId && g.date === (() => { const d = new Date(weekKey + 'T12:00'); d.setDate(d.getDate() + i); return isoDate(d) })())
            return (
              <div key={i} className={`day-cell ${dragOver === i ? 'drag-over' : ''} ${todayIdx === i ? 'today' : ''}`}
                style={{ borderTop: `2px solid ${comp ? 'var(--lime)' : st && slot.session_type !== 'REPOS' ? st.color : 'transparent'}` }}
                draggable={!!slot} onDragStart={e => slot && handleDragStart(e, { athleteId: selectedAthleteId, weekKey, dayIdx: i, slot })}
                onDragOver={e => { e.preventDefault(); setDragOver(i) }} onDragLeave={() => setDragOver(null)} onDrop={e => { handleDrop(e, i); setDragOver(null) }}>
                <div className="day-name"><span><b>{day}</b> {dateOf(i)}</span>{race && <span title={race.name}>🏁</span>}</div>
                {slot?.session_type && slot.session_type !== 'REPOS' ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, cursor: 'pointer' }} onClick={() => onEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex: i, existing: slot })}>
                    <span className="pill" style={{ background: st?.color + '22', color: st?.color, alignSelf: 'flex-start' }}>{st?.short || st?.label}</span>
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{sess?.name || st?.label}</div>
                    {slot.km > 0 && <div className="num" style={{ fontSize: 12, color: 'var(--text-2)' }}>{slot.km} km</div>}
                    {sess?.blocks?.length > 0 && <SessionBar blocks={sess.blocks} />}
                    {ssess && <div style={{ fontSize: 11.5, color: '#f472b6' }}>💪 {ssess.name}</div>}
                    {comp && <div style={{ fontSize: 12, color: 'var(--lime)' }}>✓ RPE {comp.rpe}{comp.real_km ? ` · ${comp.real_km} km` : ''}</div>}
                  </div>
                ) : slot?.session_type === 'REPOS' ? (
                  <div style={{ flex: 1, color: 'var(--text-4)', fontSize: 13, cursor: 'pointer' }} onClick={() => onEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex: i, existing: slot })}>Repos</div>
                ) : (
                  <button className="day-add" aria-label={`Ajouter une séance ${day}`} onClick={() => onEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex: i, existing: null })}>+</button>
                )}
                {slot && slot.session_type !== 'REPOS' && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                    <button className="icon-btn" title="Chat" style={{ color: hasUnread ? 'var(--accent)' : undefined }} onClick={() => openChat(selectedAthleteId, compKey, sess?.name || st?.label || day)}>💬</button>
                    <button className="icon-btn" title="Copier à tous les athlètes" onClick={() => duplicateToAll(weekKey, i)}>⊕</button>
                    {sess?.blocks?.length > 0 && <button className="icon-btn" title="Export Garmin" onClick={() => downloadTCX(generateTCX(sess.name, sess.blocks, zones), sess.name.replace(/\s+/g, '_'))}>⌚</button>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedAthleteId && calMode === 'month' && (
        <MonthCalendar athleteId={selectedAthleteId} getSlot={getSlot} sessions={sessions} completions={completions}
          raceGoals={raceGoals.filter(g => g.athlete_id === selectedAthleteId)}
          onSlotClick={({ weekKey: wk, dayIndex, slot }) => onEditSlot({ athleteId: selectedAthleteId, weekKey: wk, dayIndex, existing: slot })} />
      )}
    </div>
  )
}

// ─────────── OBJECTIFS ───────────
function Goals({ athletes, raceGoals, onAdd, onEdit, onDelete, showToast }) {
  const list = [...raceGoals].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <div className="view-enter">
      <div className="page-head">
        <div className="page-title">Objectifs</div>
        <button className="btn-primary" onClick={onAdd}>+ Ajouter une course</button>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {list.map(g => {
          const ath = athletes.find(a => a.id === g.athlete_id)
          const days = daysUntil(g.date)
          const primary = g.goal_type === 'primary'
          return (
            <div key={g.id} className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', opacity: days < 0 ? .5 : 1, borderLeft: `3px solid ${primary ? 'var(--lime)' : 'var(--border-2)'}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{g.name} {primary && <span className="pill" style={{ background: 'var(--lime-glow)', color: 'var(--lime)' }}>principal</span>}</div>
                <div className="muted" style={{ fontSize: 13 }}>{ath?.name} · {g.distance || '—'} · {g.location || '—'} · {new Date(g.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}{g.target_time ? ` · objectif ${g.target_time}` : ''}</div>
                {g.coach_notes && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{g.coach_notes}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="display" style={{ fontSize: 38, color: days < 0 ? 'var(--text-4)' : primary ? 'var(--lime)' : 'var(--text-2)' }}>{days < 0 ? 'Fait' : `J-${days}`}</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn-ghost btn-sm" onClick={() => onEdit(g)}>Modifier</button>
                  <button className="icon-btn" aria-label="Supprimer" onClick={async () => { if (confirm('Supprimer ?')) { await supabase.from('race_goals').delete().eq('id', g.id); onDelete(); showToast('Objectif supprimé') } }}>×</button>
                </div>
              </div>
            </div>
          )
        })}
        {!list.length && <div className="card muted" style={{ textAlign: 'center', padding: 32 }}>Ajoute une course : elle alimente les plans IA et le compte à rebours de l'athlète.</div>}
      </div>
    </div>
  )
}

function Notifications({ notifications, athletes, openChat, go }) {
  return (
    <div className="view-enter">
      <div className="page-title" style={{ marginBottom: 24 }}>Notifications</div>
      {!notifications.length && <div className="card muted" style={{ textAlign: 'center', padding: 40 }}>Les retours de séance et messages de tes athlètes arrivent ici.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {notifications.map(n => {
          const a = athletes.find(x => x.id === n.athlete_id)
          return (
            <div key={n.id} className="card card-hover" onClick={() => n.type === 'order' || n.type === 'subscription' ? go(n.type === 'order' ? 'shop' : 'athletes') : openChat(n.athlete_id, n.session_key, n.session_name)} style={{ borderLeft: `3px solid ${n.read ? 'transparent' : 'var(--accent)'}` }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 18 }}>{{ completion: '✅', order: '🛒', subscription: '🎉' }[n.type] || '💬'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{n.title}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{a?.name ? `${a.name} · ` : ''}{new Date(n.created_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
              {n.detail && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>{n.detail}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────── MODALES ───────────
function ModalAthlete({ editAthlete, setModal, onSaved, showToast }) {
  const isEdit = !!editAthlete
  const [form, setForm] = useState(isEdit ? { name: editAthlete.name, code: editAthlete.code, goal: editAthlete.goal || '', perf_5k: editAthlete.perf_5k || '', perf_10k: editAthlete.perf_10k || '', notes: editAthlete.notes || '', records: editAthlete.records || [] } : { name: '', code: '', goal: '', perf_5k: '', perf_10k: '', notes: '', records: [] })
  const [saving, setSaving] = useState(false)
  const [rec, setRec] = useState({ distance: '10km', time: '' })
  const zones = athleteZones(form)
  const addRecord = () => { if (!rec.time) return; setForm(f => ({ ...f, records: [...f.records.filter(r => r.distance !== rec.distance), { ...rec, id: Date.now().toString() }] })); setRec({ distance: '10km', time: '' }) }
  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return showToast('Nom et code requis', 'err')
    setSaving(true)
    const { error } = isEdit ? await supabase.from('athletes').update(form).eq('id', editAthlete.id) : await supabase.from('athletes').insert(form)
    setSaving(false)
    if (error) return showToast(error.code === '23505' ? 'Ce code est déjà pris' : error.message, 'err')
    setModal(null); onSaved(); showToast(isEdit ? 'Athlète mis à jour ✓' : 'Athlète ajouté ✓')
  }
  return (
    <Overlay onClose={() => setModal(null)} wide>
      <div className="modal-title">{isEdit ? form.name : 'Nouvel athlète'}</div>
      <div className="modal-cols">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FG label="Nom"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FG>
          <FG label="Code d'accès"><input className="input num" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))} placeholder="YOANN23" /></FG>
          <FG label="Objectif"><input className="input" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="Marathon sub 3h" /></FG>
          <FG label="Notes (visibles par l'IA, pas par l'athlète)"><textarea className="input" rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Historique de blessures, dispo, profil…" /></FG>
        </div>
        <div className="modal-side" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="fg-label">Records personnels</div>
          {form.records.map((r, i) => (
            <div key={r.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag">{r.distance}</span><span className="num" style={{ flex: 1 }}>{r.time}</span>
              <button className="icon-btn" onClick={() => setForm(f => ({ ...f, records: f.records.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" value={rec.distance} onChange={e => setRec(r => ({ ...r, distance: e.target.value }))} style={{ flex: 1 }}>{RECORD_DISTANCES.map(d => <option key={d}>{d}</option>)}</select>
            <input className="input num" value={rec.time} onChange={e => setRec(r => ({ ...r, time: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addRecord()} placeholder="38:30" style={{ flex: 1 }} />
            <button className="btn-primary" onClick={addRecord}>+</button>
          </div>
          <div className="panel" style={{ marginTop: 6 }}><ZoneTable zones={zones} /></div>
        </div>
      </div>
      <div className="modal-foot">
        <span />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

function ModalSession({ editSession, setModal, onSaved, showToast }) {
  const isEdit = !!editSession?.id
  const src = editSession || {}
  const [draft, setDraft] = useState({ name: src.name || '', session_type: src.session_type || 'EF', description: src.description || '', km: src.km || '', notes: src.notes || '', blocks: src.blocks || [] })
  const [saving, setSaving] = useState(false)
  const zones = athleteZones({ records: [{ distance: '10km', time: '42:00' }] }) // allures indicatives
  const totalKm = calcTotalDistance(draft.blocks, zones)
  const save = async () => {
    if (!draft.name.trim()) return showToast('Nom requis', 'err')
    setSaving(true)
    const data = { ...draft, km: totalKm > 0 ? totalKm : Number(draft.km) || 0 }
    const { error } = isEdit ? await supabase.from('sessions').update(data).eq('id', editSession.id) : await supabase.from('sessions').insert(data)
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    setModal(null); onSaved(); showToast(isEdit ? 'Séance mise à jour ✓' : 'Séance créée ✓')
  }
  return (
    <Overlay onClose={() => setModal(null)} wide>
      <div className="modal-title">{isEdit ? 'Modifier la séance' : src._new ? 'Séance proposée par l\'IA' : 'Nouvelle séance'}</div>
      <div className="modal-cols">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FG label="Nom"><input className="input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></FG>
          <FG label="Type"><select className="input" value={draft.session_type} onChange={e => setDraft(d => ({ ...d, session_type: e.target.value }))}>{SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></FG>
          <FG label="Description (visible par l'athlète)"><textarea className="input" rows={4} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} /></FG>
          <FG label="Notes privées"><textarea className="input" rows={2} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} /></FG>
          <SessionBar blocks={draft.blocks} />
          {totalKm > 0 && <div className="muted" style={{ fontSize: 12.5 }}>≈ {totalKm} km pour un athlète à 42 min au 10 km (recalculé pour chaque athlète)</div>}
        </div>
        <div className="modal-side"><SessionBuilder draft={draft} setDraft={setDraft} zones={zones} /></div>
      </div>
      <div className="modal-foot">
        <button className="btn-ghost btn-sm" onClick={() => { if (!draft.blocks?.length) return showToast('Ajoute des blocs', 'err'); downloadTCX(generateTCX(draft.name, draft.blocks, zones), draft.name.replace(/\s+/g, '_')); showToast('Fichier Garmin téléchargé ✓') }}>⌚ Export Garmin</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

function ModalStrengthSession({ editSession, exercises, setModal, onSaved, showToast }) {
  const isEdit = !!editSession
  const [draft, setDraft] = useState(isEdit ? { ...editSession } : { name: '', description: '', exercises: [] })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!draft.name.trim()) return showToast('Nom requis', 'err')
    setSaving(true)
    const { error } = isEdit ? await supabase.from('strength_sessions').update(draft).eq('id', editSession.id) : await supabase.from('strength_sessions').insert(draft)
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    setModal(null); onSaved(); showToast(isEdit ? 'Séance mise à jour ✓' : 'Séance créée ✓')
  }
  return (
    <Overlay onClose={() => setModal(null)} wide>
      <div className="modal-title">{isEdit ? 'Modifier' : 'Nouvelle séance de renfo'}</div>
      <div className="modal-cols">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FG label="Nom"><input className="input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="PPG propulsion, gainage…" /></FG>
          <FG label="Description"><textarea className="input" rows={3} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} /></FG>
        </div>
        <div className="modal-side"><StrengthSessionBuilder draft={draft} setDraft={setDraft} exercises={exercises} /></div>
      </div>
      <div className="modal-foot">
        <span />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

function ModalSlot({ slot, sessions, allSessions, strengthSessions, athletes, setModal, onSaved, showToast }) {
  const { athleteId, weekKey, dayIndex, existing } = slot
  const [form, setForm] = useState({ session_type: existing?.session_type || 'EF', session_id: existing?.session_id || '', strength_session_id: existing?.strength_session_id || '', km: existing?.km || '', note: existing?.note || '' })
  const [saving, setSaving] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [extra, setExtra] = useState([])
  const athlete = athletes.find(a => a.id === athleteId)
  const zones = athleteZones(athlete)
  const selectedSess = [...extra, ...allSessions].find(s => s.id === form.session_id)
  const base = [...extra, ...sessions]
  const options = selectedSess && !base.some(s => s.id === selectedSess.id) ? [selectedSess, ...base] : base
  const autoKm = selectedSess ? calcTotalDistance(selectedSess.blocks || [], zones) : 0
  const date = (() => { const d = new Date(weekKey + 'T12:00'); d.setDate(d.getDate() + dayIndex); return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) })()

  const aiGenerate = async () => {
    if (!aiText.trim()) return
    setAiBusy(true)
    try {
      const s = await api('ai', { action: 'session', text: aiText, athlete_id: athleteId, method: localStorage.getItem('rr_method') || undefined }, { coach: true })
      const { data, error } = await supabase.from('sessions').insert({ name: s.name, session_type: s.session_type, description: s.description, blocks: s.blocks, km: s.km, notes: '' }).select().single()
      if (error) throw error
      setExtra(x => [data, ...x])
      setForm(f => ({ ...f, session_type: s.session_type, session_id: data.id }))
      setAiText(''); showToast('Séance créée et ajoutée à ta bibliothèque ✓')
    } catch (e) { showToast(e.message, 'err') }
    setAiBusy(false)
  }
  const save = async () => {
    setSaving(true)
    const data = { athlete_id: athleteId, week_key: weekKey, day_index: dayIndex, session_type: form.session_type, session_id: form.session_type === 'REPOS' ? null : form.session_id || null, strength_session_id: form.strength_session_id || null, km: form.session_type === 'REPOS' ? 0 : autoKm > 0 ? autoKm : Number(form.km) || 0, note: form.note }
    const { error } = await supabase.from('week_slots').upsert(data, { onConflict: 'athlete_id,week_key,day_index' })
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    setModal(null); onSaved(); showToast('Planning mis à jour ✓')
  }
  const clear = async () => { await supabase.from('week_slots').delete().match({ athlete_id: athleteId, week_key: weekKey, day_index: dayIndex }); setModal(null); onSaved(); showToast('Jour vidé') }

  return (
    <Overlay onClose={() => setModal(null)}>
      <div className="modal-title" style={{ marginBottom: 4 }}>{athlete?.name}</div>
      <div className="muted" style={{ marginBottom: 18 }}>{date.charAt(0).toUpperCase() + date.slice(1)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel ai-glow" style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={aiText} onChange={e => setAiText(e.target.value)} onKeyDown={e => e.key === 'Enter' && aiGenerate()} placeholder={`✦ Séance sur mesure pour ${athlete?.name?.split(' ')[0] || "l'athlète"}…`} />
          <button className="btn-lime" onClick={aiGenerate} disabled={aiBusy}>{aiBusy ? '…' : 'Créer'}</button>
        </div>
        <FG label="Type"><select className="input" value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))}>{SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></FG>
        {form.session_type !== 'REPOS' && <>
          <FG label="Séance"><select className="input" value={form.session_id} onChange={e => setForm(f => ({ ...f, session_id: e.target.value }))}><option value="">— Séance libre —</option>{options.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FG>
          {selectedSess?.blocks?.length > 0 && <div className="panel"><SessionBar blocks={selectedSess.blocks} /><div className="muted num" style={{ fontSize: 11.5, marginTop: 8 }}>{blocksToText(selectedSess.blocks)} · ≈ {autoKm} km</div></div>}
          <FG label="Renforcement"><select className="input" value={form.strength_session_id} onChange={e => setForm(f => ({ ...f, strength_session_id: e.target.value }))}><option value="">— Aucun —</option>{strengthSessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FG>
          {!autoKm && <FG label="Kilomètres"><input className="input" type="number" step="0.5" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value }))} /></FG>}
          <FG label="Consigne pour l'athlète"><textarea className="input" rows={3} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Nutrition, cardio, sensations visées…" /></FG>
        </>}
        <div className="modal-foot" style={{ marginTop: 6 }}>
          <button className="btn-danger" onClick={clear}>Vider le jour</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : 'Valider'}</button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

function ModalGoal({ editGoal, athletes, setModal, onSaved, showToast }) {
  const isEdit = !!editGoal
  const [form, setForm] = useState(isEdit ? { athlete_id: editGoal.athlete_id, name: editGoal.name, date: editGoal.date, location: editGoal.location || '', distance: editGoal.distance || '', goal_type: editGoal.goal_type || 'primary', target_time: editGoal.target_time || '', coach_notes: editGoal.coach_notes || '' } : { athlete_id: athletes[0]?.id || '', name: '', date: '', location: '', distance: '', goal_type: 'primary', target_time: '', coach_notes: '' })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!form.name || !form.date || !form.athlete_id) return showToast('Athlète, course et date requis', 'err')
    setSaving(true)
    const { error } = isEdit ? await supabase.from('race_goals').update(form).eq('id', editGoal.id) : await supabase.from('race_goals').insert(form)
    setSaving(false)
    if (error) return showToast(error.message, 'err')
    setModal(null); onSaved(); showToast(isEdit ? 'Objectif mis à jour ✓' : 'Objectif ajouté ✓')
  }
  return (
    <Overlay onClose={() => setModal(null)}>
      <div className="modal-title">{isEdit ? 'Modifier la course' : 'Nouvelle course'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FG label="Athlète"><select className="input" value={form.athlete_id} onChange={e => setForm(f => ({ ...f, athlete_id: e.target.value }))}>{athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></FG>
        <FG label="Course"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Marathon de Lyon" /></FG>
        <div className="grid-2">
          <FG label="Date"><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></FG>
          <FG label="Priorité"><select className="input" value={form.goal_type} onChange={e => setForm(f => ({ ...f, goal_type: e.target.value }))}><option value="primary">Principale</option><option value="secondary">Secondaire</option></select></FG>
        </div>
        <div className="grid-2">
          <FG label="Lieu"><input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></FG>
          <FG label="Distance"><input className="input" value={form.distance} onChange={e => setForm(f => ({ ...f, distance: e.target.value }))} placeholder="Marathon" /></FG>
        </div>
        <FG label="Temps visé"><input className="input" value={form.target_time} onChange={e => setForm(f => ({ ...f, target_time: e.target.value }))} placeholder="2h59" /></FG>
        <FG label="Consignes (visibles par l'athlète)"><textarea className="input" rows={3} value={form.coach_notes} onChange={e => setForm(f => ({ ...f, coach_notes: e.target.value }))} /></FG>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </div>
    </Overlay>
  )
}
