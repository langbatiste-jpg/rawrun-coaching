import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { calculateZonesFromRecords, calculateZones, getWeekKey, generateTCX, downloadTCX, daysUntil } from '../utils'
import { SESSION_TYPES, DAYS, BASE_ZONES, RECORD_DISTANCES } from '../constants'
import { Overlay, FG, WeekNav } from './ui'
import ChatModal from './ChatModal'
import MonthCalendar from './MonthCalendar'
import SessionBuilder, { calcTotalDistance } from './SessionBuilder'

export default function CoachApp({ onLogout, showToast }) {
  const [view, setView] = useState('dashboard')
  const [calMode, setCalMode] = useState('week') // week | month
  const [athletes, setAthletes] = useState([])
  const [sessions, setSessions] = useState([])
  const [completions, setCompletions] = useState({})
  const [notifications, setNotifications] = useState([])
  const [weekData, setWeekData] = useState({})
  const [raceGoals, setRaceGoals] = useState([])
  const [modal, setModal] = useState(null)
  const [editAthlete, setEditAthlete] = useState(null)
  const [editSession, setEditSession] = useState(null)
  const [editSlot, setEditSlot] = useState(null)
  const [editGoal, setEditGoal] = useState(null)
  const [chatTarget, setChatTarget] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)
  const weekKey = getWeekKey(weekOffset)
  const unread = notifications.filter(n => !n.read).length

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    const ch = supabase.channel('coach_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, loadNotifications)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'completions' }, () => { loadNotifications(); loadCompletions() })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const loadAll = async () => {
    await Promise.all([loadAthletes(), loadSessions(), loadNotifications(), loadCompletions(), loadWeekData(), loadRaceGoals()])
  }
  const loadAthletes = async () => { const { data } = await supabase.from('athletes').select('*').order('name'); setAthletes(data || []) }
  const loadSessions = async () => { const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: false }); setSessions(data || []) }
  const loadNotifications = async () => { const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60); setNotifications(data || []) }
  const loadCompletions = async () => { const { data } = await supabase.from('completions').select('*'); const map = {}; data?.forEach(c => { map[c.session_key] = c }); setCompletions(map) }
  const loadWeekData = async () => { const { data } = await supabase.from('week_slots').select('*'); const map = {}; data?.forEach(s => { map[`${s.athlete_id}__${s.week_key}__${s.day_index}`] = s }); setWeekData(map) }
  const loadRaceGoals = async () => { const { data } = await supabase.from('race_goals').select('*').order('date'); setRaceGoals(data || []) }

  const getSlot = (athleteId, wk, dayIdx) => weekData[`${athleteId}__${wk}__${dayIdx}`] || null
  const getAthleteWeek = (athleteId, wk) => DAYS.map((_, i) => getSlot(athleteId, wk, i))
  const getAthleteZones = (athlete) => {
    if (athlete?.records?.length) return calculateZonesFromRecords(athlete.records)
    if (athlete?.perf_5k) return calculateZones(athlete.perf_5k, 5)
    if (athlete?.perf_10k) return calculateZones(athlete.perf_10k, 10)
    return BASE_ZONES.map(z => ({ ...z, paceMin: '—', paceMax: '—' }))
  }
  const markAllRead = async () => { await supabase.from('notifications').update({ read: true }).eq('read', false); loadNotifications() }
  const openChat = (athleteId, sessionKey, sessionName) => {
    const athlete = athletes.find(a => a.id === athleteId)
    setChatTarget({ athleteId, sessionKey, sessionName, athleteName: athlete?.name })
    supabase.from('notifications').update({ read: true }).eq('session_key', sessionKey).then(loadNotifications)
  }

  return (
    <div>
      <nav className="rr-nav">
        <div className="rr-nav-logo">RAW<span>RUN</span> <span className="rr-nav-role">coach</span></div>
        <div className="rr-nav-spacer" />
        {[['dashboard','Vue globale'],['athletes','Athlètes'],['sessions','Séances'],['planning','Planning'],['goals','Objectifs']].map(([v,l]) => (
          <button key={v} className={`rr-nav-btn ${view===v?'active':''}`} onClick={() => setView(v)}>{l}</button>
        ))}
        <button className={`rr-nav-btn ${view==='notifications'?'active':''}`} onClick={() => { setView('notifications'); markAllRead() }} style={{ position: 'relative' }}>
          🔔 {unread > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#e11d48' }} />}
        </button>
        <button className="btn-ghost" style={{ fontSize: 12, marginLeft: 8 }} onClick={onLogout}>← Déco</button>
      </nav>

      <div className="rr-content">
        {view === 'dashboard' && <Dashboard athletes={athletes} weekKey={weekKey} weekOffset={weekOffset} setWeekOffset={setWeekOffset} getAthleteWeek={getAthleteWeek} completions={completions} notifications={notifications} raceGoals={raceGoals} setSelectedAthleteId={setSelectedAthleteId} setView={setView} />}
        {view === 'athletes' && <Athletes athletes={athletes} raceGoals={raceGoals} onAdd={() => { setEditAthlete(null); setModal('athlete') }} onEdit={a => { setEditAthlete(a); setModal('athlete') }} onDelete={loadAthletes} showToast={showToast} getAthleteZones={getAthleteZones} />}
        {view === 'sessions' && <Sessions sessions={sessions} onAdd={() => { setEditSession(null); setModal('session') }} onEdit={s => { setEditSession(s); setModal('session') }} onDelete={loadSessions} showToast={showToast} />}
        {view === 'planning' && (
          <Planning athletes={athletes} sessions={sessions} weekKey={weekKey} weekOffset={weekOffset} setWeekOffset={setWeekOffset}
            selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId}
            getAthleteWeek={getAthleteWeek} getSlot={getSlot} completions={completions} notifications={notifications}
            setEditSlot={setEditSlot} setModal={setModal} openChat={openChat} loadWeekData={loadWeekData}
            calMode={calMode} setCalMode={setCalMode} raceGoals={raceGoals} getAthleteZones={getAthleteZones} weekData={weekData} />
        )}
        {view === 'goals' && <Goals athletes={athletes} raceGoals={raceGoals} onAdd={() => { setEditGoal(null); setModal('goal') }} onEdit={g => { setEditGoal(g); setModal('goal') }} onDelete={loadRaceGoals} showToast={showToast} />}
        {view === 'notifications' && <Notifications notifications={notifications} athletes={athletes} openChat={openChat} />}
      </div>

      {modal === 'athlete' && <ModalAthlete editAthlete={editAthlete} setModal={setModal} onSaved={loadAthletes} showToast={showToast} getAthleteZones={getAthleteZones} />}
      {modal === 'session' && <ModalSession editSession={editSession} setModal={setModal} onSaved={loadSessions} showToast={showToast} />}
      {modal === 'slot' && editSlot && <ModalSlot slot={editSlot} sessions={sessions} athletes={athletes} setModal={setModal} onSaved={loadWeekData} showToast={showToast} getAthleteZones={getAthleteZones} />}
      {modal === 'goal' && <ModalGoal editGoal={editGoal} athletes={athletes} setModal={setModal} onSaved={loadRaceGoals} showToast={showToast} />}
      {chatTarget && <ChatModal {...chatTarget} isCoach completion={completions[chatTarget.sessionKey]} onClose={() => setChatTarget(null)} />}
    </div>
  )
}

function Dashboard({ athletes, weekKey, weekOffset, setWeekOffset, getAthleteWeek, completions, notifications, raceGoals, setSelectedAthleteId, setView }) {
  const totalKm = athletes.reduce((acc, a) => {
    const w = getAthleteWeek(a.id, weekKey)
    return acc + w.reduce((s, d) => s + (d?.km || 0), 0)
  }, 0)
  const completedCount = Object.keys(completions).filter(k => k.includes(weekKey)).length
  const upcomingRaces = raceGoals.filter(g => daysUntil(g.date) >= 0 && daysUntil(g.date) <= 60).sort((a, b) => new Date(a.date) - new Date(b.date))

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">Vue globale</div>
        <div className="page-sub">Semaine du {weekKey}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />
      </div>
      <div className="stats-grid">
        {[{ v: athletes.length, l: 'Athlètes' }, { v: totalKm + ' km', l: 'Volume planifié' }, { v: completedCount, l: 'Séances réalisées' }, { v: upcomingRaces.length, l: 'Courses à venir' }].map((s, i) => (
          <div key={i} className="card"><div className="stat-val">{s.v}</div><div className="stat-label">{s.l}</div></div>
        ))}
      </div>
      {upcomingRaces.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em', marginBottom: 10 }}>PROCHAINES COURSES</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {upcomingRaces.map(r => {
              const ath = athletes.find(a => a.id === r.athlete_id)
              const days = daysUntil(r.date)
              return (
                <div key={r.id} className="card" style={{ flex: '1 1 200px', borderLeft: `3px solid ${r.goal_type === 'primary' ? '#fbbf24' : '#64748b'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{ath?.name} · {r.location || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: r.goal_type === 'primary' ? '#fbbf24' : '#94a3b8', fontFamily: "'Syne'" }}>J−{days}</div>
                      <div style={{ fontSize: 10, color: '#475569' }}>{r.goal_type === 'primary' ? '🎯 Principal' : '📌 Secondaire'}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {athletes.map(a => {
        const w = getAthleteWeek(a.id, weekKey)
        const kmTot = w.reduce((s, d) => s + (d?.km || 0), 0)
        const done = w.filter((_, i) => !!completions[`${a.id}__${weekKey}__${i}`]).length
        const planned = w.filter(d => d && d.session_type !== 'REPOS').length
        const hasUnread = notifications.some(n => n.athlete_id === a.id && !n.read)
        const nextRace = raceGoals.filter(g => g.athlete_id === a.id && daysUntil(g.date) >= 0).sort((a, b) => new Date(a.date) - new Date(b.date))[0]
        return (
          <div key={a.id} className="card card-hover" style={{ marginBottom: 10, borderLeft: `3px solid ${hasUnread ? '#e11d48' : '#1e293b'}` }}
            onClick={() => { setSelectedAthleteId(a.id); setView('planning') }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div className="avatar">{a.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>
                  {hasUnread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e11d48', display: 'inline-block' }} />}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a.goal || '—'} · Code: <b style={{ color: '#94a3b8' }}>{a.code}</b></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div>{kmTot} km · {done}/{planned}</div>
                {nextRace && <div style={{ color: '#fbbf24', fontSize: 11 }}>🏆 J−{daysUntil(nextRace.date)}</div>}
              </div>
            </div>
            <div className="week-strip">
              {w.map((d, i) => {
                const comp = !!completions[`${a.id}__${weekKey}__${i}`]
                const st = d?.session_type ? SESSION_TYPES.find(t => t.id === d.session_type) : null
                return <div key={i} className="week-strip-bar" style={{ background: comp ? '#4ade80' : st?.color || '#1e293b' }} />
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Athletes({ athletes, raceGoals, onAdd, onEdit, onDelete, showToast, getAthleteZones }) {
  const deleteAthlete = async (id, name) => {
    if (!confirm(`Supprimer ${name} ?`)) return
    await supabase.from('athletes').delete().eq('id', id)
    onDelete(); showToast('Athlète supprimé')
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-title">Athlètes</div>
        <button className="btn-primary" onClick={onAdd}>+ Ajouter</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {athletes.map(a => {
          const zones = getAthleteZones(a)
          const goals = raceGoals.filter(g => g.athlete_id === a.id && daysUntil(g.date) >= 0).sort((x, y) => new Date(x.date) - new Date(y.date))
          return (
            <div key={a.id} className="card">
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div className="avatar" style={{ width: 40, height: 40, fontSize: 13 }}>{a.name.slice(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 12, color: '#64748b' }}>{a.goal || '—'}</div></div>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => onEdit(a)}>Éditer</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="tag">Code: {a.code}</span>
                {a.perf_5k && <span className="tag">5km: {a.perf_5k}</span>}
                {(a.records?.length > 0) && <span className="tag">{a.records.length} records</span>}
              </div>
              {goals.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {goals.slice(0, 2).map(g => (
                    <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#0a0f1a', borderRadius: 6, marginBottom: 4, borderLeft: `2px solid ${g.goal_type === 'primary' ? '#fbbf24' : '#475569'}` }}>
                      <div style={{ fontSize: 12 }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: '#fbbf24' }}>J−{daysUntil(g.date)}</div>
                    </div>
                  ))}
                </div>
              )}
              {zones[0].paceMin !== '—' && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, letterSpacing: '0.06em' }}>ZONES AUTO</div>
                  {zones.slice(0, 5).map(z => (
                    <div key={z.id} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11 }}>
                      <div style={{ width: 5, height: 5, borderRadius: 1, background: z.color, marginTop: 4, flexShrink: 0 }} />
                      <span style={{ color: '#64748b', width: 70, flexShrink: 0 }}>Z{z.id} {z.short}</span>
                      <span style={{ color: '#e2e8f0' }}>{z.paceMax} – {z.paceMin} /km</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => deleteAthlete(a.id, a.name)}>Supprimer</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Sessions({ sessions, onAdd, onEdit, onDelete, showToast }) {
  const deleteSession = async (id) => {
    if (!confirm('Supprimer ?')) return
    await supabase.from('sessions').delete().eq('id', id)
    onDelete(); showToast('Supprimé')
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-title">Bibliothèque de séances</div>
        <button className="btn-primary" onClick={onAdd}>+ Créer</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {sessions.map(s => {
          const st = SESSION_TYPES.find(t => t.id === s.session_type)
          const blocks = s.blocks || []
          const hasLoops = blocks.some(b => b.isLoop)
          return (
            <div key={s.id} className="card" style={{ borderLeft: `3px solid ${st?.color || '#334155'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: st?.color }}>{st?.label}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  {s.km > 0 && <span className="tag">{s.km} km</span>}
                  {hasLoops && <span className="tag" style={{ color: '#e11d48' }}>🔁</span>}
                </div>
              </div>
              {s.description && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>{s.description}</div>}
              {blocks.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {blocks.map((b, i) => {
                    if (b.isLoop) return (
                      <div key={i} style={{ fontSize: 11, color: '#e11d48', marginBottom: 3 }}>
                        🔁 {b.loopReps}× ({b.loopBlocks?.length || 0} blocs)
                      </div>
                    )
                    const z = BASE_ZONES[b.zone - 1]
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11 }}>
                        <div style={{ width: 5, height: 5, borderRadius: 1, background: z?.color, flexShrink: 0, marginTop: 4 }} />
                        <span style={{ color: '#64748b' }}>{b.name || `Z${b.zone}`}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>{b.durationType === 'time' ? `${b.duration}${b.timeUnit}` : `${b.distance}${b.distUnit}`}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ fontSize: 11, flex: 1 }} onClick={() => onEdit(s)}>Éditer</button>
                <button className="btn-ghost" style={{ fontSize: 11, color: '#e11d48' }} onClick={() => deleteSession(s.id)}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Planning({ athletes, sessions, weekKey, weekOffset, setWeekOffset, selectedAthleteId, setSelectedAthleteId, getAthleteWeek, getSlot, completions, notifications, setEditSlot, setModal, openChat, loadWeekData, calMode, setCalMode, raceGoals, getAthleteZones, weekData }) {
  const athlete = athletes.find(a => a.id === selectedAthleteId)
  const weekSlots = selectedAthleteId ? getAthleteWeek(selectedAthleteId, weekKey) : Array(7).fill(null)
  const kmTotal = weekSlots.reduce((s, d) => s + (d?.km || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="page-title">Planning</div>
          <div className="page-sub">{athlete ? athlete.name : 'Sélectionne un athlète'} {kmTotal > 0 ? `· ${kmTotal} km` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2, background: '#0a0f1a', borderRadius: 6, padding: 3 }}>
            {[['week', 'Semaine'], ['month', 'Mois']].map(([m, l]) => (
              <button key={m} onClick={() => setCalMode(m)} style={{ padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 11, background: calMode === m ? '#1e293b' : 'transparent', color: calMode === m ? '#fff' : '#64748b' }}>{l}</button>
            ))}
          </div>
          {calMode === 'week' && <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {athletes.map(a => (
          <button key={a.id} className={selectedAthleteId === a.id ? 'btn-primary' : 'btn-ghost'} style={{ fontSize: 12 }}
            onClick={() => setSelectedAthleteId(a.id)}>{a.name}</button>
        ))}
      </div>

      {selectedAthleteId && calMode === 'week' && (
        <div className="week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
          {DAYS.map((day, i) => {
            const slot = weekSlots[i]
            const st = slot?.session_type ? SESSION_TYPES.find(t => t.id === slot.session_type) : null
            const sess = slot?.session_id ? sessions.find(s => s.id === slot.session_id) : null
            const compKey = `${selectedAthleteId}__${weekKey}__${i}`
            const comp = completions[compKey]
            const hasUnread = notifications.some(n => n.session_key === compKey && !n.read)
            return (
              <div key={i} className="day-cell" style={{ borderTop: `2px solid ${comp ? '#4ade80' : st?.color || '#1e293b'}` }}>
                <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.06em', marginBottom: 8 }}>{day.toUpperCase()}</div>
                {slot?.session_type && slot.session_type !== 'REPOS' ? (
                  <>
                    <div style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: (st?.color || '#334155') + '22', color: st?.color, display: 'inline-block', marginBottom: 5 }}>{st?.label?.split(' ')[0]}</div>
                    {slot.km > 0 && <div style={{ fontSize: 13, fontWeight: 600 }}>{slot.km} km</div>}
                    {sess && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>{sess.name}</div>}
                    {comp && <div style={{ fontSize: 10, color: '#4ade80', marginTop: 3 }}>✓ RPE {comp.rpe}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 7px', flex: 1 }}
                        onClick={() => { setEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex: i, existing: slot }); setModal('slot') }}>Éditer</button>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 7px', color: hasUnread ? '#e11d48' : 'inherit', position: 'relative' }}
                        onClick={() => openChat(selectedAthleteId, compKey, sess?.name || st?.label || day)}>
                        💬 {hasUnread && <span style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5, borderRadius: '50%', background: '#e11d48' }} />}
                      </button>
                    </div>
                  </>
                ) : slot?.session_type === 'REPOS' ? (
                  <div style={{ fontSize: 12, color: '#334155' }}>Repos</div>
                ) : (
                  <button style={{ background: 'none', border: 'none', color: '#1e293b', fontSize: 22, cursor: 'pointer', width: '100%', paddingTop: 8 }}
                    onClick={() => { setEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex: i, existing: null }); setModal('slot') }}>+</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedAthleteId && calMode === 'month' && (
        <MonthCalendar
          athleteId={selectedAthleteId}
          getSlot={getSlot}
          sessions={sessions}
          completions={completions}
          raceGoals={raceGoals.filter(g => g.athlete_id === selectedAthleteId)}
          onSlotClick={({ weekKey, dayIndex, slot }) => {
            setEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex, existing: slot })
            setModal('slot')
          }}
        />
      )}
    </div>
  )
}

function Goals({ athletes, raceGoals, onAdd, onEdit, onDelete, showToast }) {
  const deleteGoal = async (id) => {
    if (!confirm('Supprimer cet objectif ?')) return
    await supabase.from('race_goals').delete().eq('id', id)
    onDelete(); showToast('Objectif supprimé')
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-title">Objectifs de course</div>
        <button className="btn-primary" onClick={onAdd}>+ Ajouter</button>
      </div>
      {raceGoals.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: 48 }}>Aucun objectif. Ajoute la prochaine course de tes athlètes !</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {raceGoals.sort((a, b) => new Date(a.date) - new Date(b.date)).map(g => {
          const ath = athletes.find(a => a.id === g.athlete_id)
          const days = daysUntil(g.date)
          const isPast = days < 0
          return (
            <div key={g.id} className="card" style={{ borderLeft: `3px solid ${g.goal_type === 'primary' ? '#fbbf24' : '#64748b'}`, opacity: isPast ? 0.5 : 1 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{g.name}</div>
                    <span className="tag" style={{ background: g.goal_type === 'primary' ? '#fbbf2422' : '#1e293b', color: g.goal_type === 'primary' ? '#fbbf24' : '#64748b' }}>
                      {g.goal_type === 'primary' ? '🎯 Principal' : '📌 Secondaire'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{ath?.name} · {g.location || '—'} · {g.distance || '—'} · {new Date(g.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  {g.target_time && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Objectif temps : {g.target_time}</div>}
                  {g.coach_notes && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, fontStyle: 'italic' }}>{g.coach_notes}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'Syne'", fontSize: 24, fontWeight: 800, color: isPast ? '#475569' : g.goal_type === 'primary' ? '#fbbf24' : '#94a3b8' }}>
                    {isPast ? 'Passé' : `J−${days}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => onEdit(g)}>Éditer</button>
                    <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => deleteGoal(g.id)}>×</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Notifications({ notifications, athletes, openChat }) {
  return (
    <div>
      <div className="page-title" style={{ marginBottom: 24 }}>Notifications</div>
      {notifications.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: 48 }}>Aucune notification.</div>}
      {notifications.map(n => {
        const a = athletes.find(x => x.id === n.athlete_id)
        return (
          <div key={n.id} className="card card-hover" style={{ marginBottom: 10, borderLeft: `3px solid ${n.read ? '#1e293b' : '#e11d48'}` }}
            onClick={() => openChat(n.athlete_id, n.session_key, n.session_name)}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 18 }}>{n.type === 'completion' ? '✅' : '💬'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a?.name} · {new Date(n.created_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
              </div>
              {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e11d48', display: 'inline-block' }} />}
            </div>
            {n.detail && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>{n.detail}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── MODALS ──

function ModalAthlete({ editAthlete, setModal, onSaved, showToast, getAthleteZones }) {
  const isEdit = !!editAthlete
  const [form, setForm] = useState(isEdit ? { name: editAthlete.name, code: editAthlete.code, goal: editAthlete.goal || '', perf_5k: editAthlete.perf_5k || '', perf_10k: editAthlete.perf_10k || '', notes: editAthlete.notes || '', records: editAthlete.records || [] } : { name: '', code: '', goal: '', perf_5k: '', perf_10k: '', notes: '', records: [] })
  const [saving, setSaving] = useState(false)
  const [newRecord, setNewRecord] = useState({ distance: '5km', time: '' })

  const zones = form.records.length > 0 ? calculateZonesFromRecords(form.records) : (form.perf_5k ? calculateZones(form.perf_5k, 5) : null)

  const addRecord = () => {
    if (!newRecord.time) return
    setForm(f => ({ ...f, records: [...f.records, { ...newRecord, id: Date.now().toString() }] }))
    setNewRecord({ distance: '5km', time: '' })
  }

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return showToast('Nom et code requis', 'err')
    setSaving(true)
    const data = { name: form.name.trim(), code: form.code.trim().toUpperCase(), goal: form.goal, perf_5k: form.perf_5k, perf_10k: form.perf_10k, notes: form.notes, records: form.records }
    if (isEdit) await supabase.from('athletes').update(data).eq('id', editAthlete.id)
    else await supabase.from('athletes').insert(data)
    setSaving(false); setModal(null); onSaved(); showToast(isEdit ? 'Mis à jour ✓' : 'Athlète ajouté ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)} wide>
      <div className="modal-title">{isEdit ? 'Modifier' : 'Nouvel athlète'}</div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FG label="NOM COMPLET"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FG>
          <FG label="CODE D'ACCÈS"><input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="ex: YOANN23" /></FG>
          <FG label="OBJECTIF / PROFIL"><input className="input" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="ex: UTMB, Marathon sub-3…" /></FG>
          <FG label="NOTES COACH"><textarea className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></FG>
        </div>
        <div style={{ width: 300 }}>
          <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em', marginBottom: 10 }}>RECORDS PERSONNELS</div>
          {form.records.map((r, i) => (
            <div key={r.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
              <span className="tag">{r.distance}</span>
              <span style={{ color: '#e2e8f0', flex: 1 }}>{r.time}</span>
              <button style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }} onClick={() => setForm(f => ({ ...f, records: f.records.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <select className="input" value={newRecord.distance} onChange={e => setNewRecord(r => ({ ...r, distance: e.target.value }))} style={{ flex: 1, fontSize: 12 }}>
              {RECORD_DISTANCES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input className="input" value={newRecord.time} onChange={e => setNewRecord(r => ({ ...r, time: e.target.value }))} placeholder="mm:ss" style={{ flex: 1, fontSize: 12 }} />
            <button className="btn-primary" style={{ fontSize: 11, padding: '8px 12px' }} onClick={addRecord}>+</button>
          </div>
          {zones && (
            <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, letterSpacing: '0.06em' }}>ZONES AUTO-CALCULÉES</div>
              {zones.map(z => (
                <div key={z.id} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 1, background: z.color, marginTop: 4, flexShrink: 0 }} />
                  <span style={{ color: '#64748b', width: 70, flexShrink: 0 }}>Z{z.id} {z.short}</span>
                  <span style={{ color: '#e2e8f0' }}>{z.paceMax} – {z.paceMin} /km</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid #1e293b' }}>
        <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Mettre à jour' : 'Créer'}</button>
      </div>
    </Overlay>
  )
}

function ModalSession({ editSession, setModal, onSaved, showToast }) {
  const isEdit = !!editSession
  const [draft, setDraft] = useState(isEdit ? { name: editSession.name, session_type: editSession.session_type, description: editSession.description || '', km: editSession.km || '', notes: editSession.notes || '', blocks: editSession.blocks || [] } : { name: '', session_type: 'EF', description: '', km: '', notes: '', blocks: [] })
  const [saving, setSaving] = useState(false)
  const zones = BASE_ZONES.map(z => ({ ...z, paceMin: '—', paceMax: '—' }))
  const totalKm = calcTotalDistance(draft.blocks, zones)

  const save = async () => {
    if (!draft.name.trim()) return showToast('Nom requis', 'err')
    const dataToSave = { ...draft, km: totalKm > 0 ? totalKm : (Number(draft.km) || 0) }
    setSaving(true)
    if (isEdit) await supabase.from('sessions').update(dataToSave).eq('id', editSession.id)
    else await supabase.from('sessions').insert(dataToSave)
    setSaving(false); setModal(null); onSaved(); showToast(isEdit ? 'Mis à jour ✓' : 'Séance créée ✓')
  }

  const exportTCX = () => {
    if (!draft.blocks?.length) return showToast('Ajoute des blocs', 'err')
    downloadTCX(generateTCX(draft.name, draft.blocks, zones), draft.name.replace(/\s+/g, '_'))
    showToast('TCX téléchargé ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)} wide>
      <div className="modal-title">{isEdit ? 'Modifier la séance' : 'Nouvelle séance'}</div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FG label="NOM"><input className="input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></FG>
          <FG label="TYPE">
            <select className="input" value={draft.session_type} onChange={e => setDraft(d => ({ ...d, session_type: e.target.value }))}>
              {SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </FG>
          <FG label="DESCRIPTION / CONSIGNES"><textarea className="input" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} rows={3} /></FG>
          <FG label="NOTES PRIVÉES COACH"><textarea className="input" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={2} /></FG>
          {totalKm > 0 && <div style={{ fontSize: 12, color: '#4ade80' }}>Distance calculée : ≈ {totalKm} km</div>}
        </div>
        <div style={{ width: 320 }}>
          <SessionBuilder draft={draft} setDraft={setDraft} zones={zones} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid #1e293b' }}>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={exportTCX}>⬇ Export Garmin (.tcx)</button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Mettre à jour' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

function ModalSlot({ slot, sessions, athletes, setModal, onSaved, showToast, getAthleteZones }) {
  const { athleteId, weekKey, dayIndex, existing } = slot
  const [form, setForm] = useState({ session_type: existing?.session_type || 'REPOS', session_id: existing?.session_id || '', km: existing?.km || '', note: existing?.note || '' })
  const [saving, setSaving] = useState(false)
  const selectedSess = sessions.find(s => s.id === form.session_id)
  const athlete = athletes.find(a => a.id === athleteId)
  const zones = getAthleteZones(athlete)

  const save = async () => {
    setSaving(true)
    const totalKm = selectedSess ? calcTotalDistance(selectedSess.blocks || [], zones) : Number(form.km) || 0
    const data = { athlete_id: athleteId, week_key: weekKey, day_index: dayIndex, session_type: form.session_type, session_id: form.session_id || null, km: totalKm > 0 ? totalKm : Number(form.km) || 0, note: form.note }
    await supabase.from('week_slots').upsert(data, { onConflict: 'athlete_id,week_key,day_index' })
    setSaving(false); setModal(null); onSaved(); showToast('Planning mis à jour ✓')
  }

  const clear = async () => {
    await supabase.from('week_slots').delete().match({ athlete_id: athleteId, week_key: weekKey, day_index: dayIndex })
    setModal(null); onSaved(); showToast('Jour effacé')
  }

  return (
    <Overlay onClose={() => setModal(null)}>
      <div className="modal-title">{DAYS[dayIndex]} — {weekKey}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FG label="TYPE">
          <select className="input" value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))}>
            {SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </FG>
        {form.session_type !== 'REPOS' && <>
          <FG label="SÉANCE DE LA BIBLIOTHÈQUE">
            <select className="input" value={form.session_id} onChange={e => { const s = sessions.find(x => x.id === e.target.value); setForm(f => ({ ...f, session_id: e.target.value, km: s?.km || f.km })) }}>
              <option value="">— Séance libre —</option>
              {sessions.filter(s => s.session_type === form.session_type || true).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FG>
          {selectedSess?.blocks?.length > 0 && (
            <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 12 }}>
              {selectedSess.blocks.map((b, i) => {
                if (b.isLoop) return <div key={i} style={{ color: '#e11d48', marginBottom: 4 }}>🔁 {b.loopReps}× ({b.loopBlocks?.length} blocs)</div>
                const z = zones[b.zone - 1]
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 5, height: 5, borderRadius: 1, background: z?.color, flexShrink: 0, marginTop: 4 }} />
                    <span style={{ color: '#64748b' }}>{b.name || `Z${b.zone}`}</span>
                    <span style={{ color: '#e2e8f0', marginLeft: 'auto' }}>{z?.paceMax} – {z?.paceMin}</span>
                  </div>
                )
              })}
              <div style={{ fontSize: 11, color: '#4ade80', marginTop: 6 }}>≈ {calcTotalDistance(selectedSess.blocks, zones)} km calculés</div>
            </div>
          )}
          <FG label="KILOMÉTRAGE (si non calculé)"><input className="input" type="number" step="0.5" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value }))} /></FG>
          <FG label="NOTE POUR L'ATHLÈTE"><textarea className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3} placeholder="Consignes spécifiques pour ce jour…" /></FG>
        </>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button className="btn-danger" style={{ fontSize: 12 }} onClick={clear}>Effacer</button>
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
    if (!form.name || !form.date || !form.athlete_id) return showToast('Remplis les champs requis', 'err')
    setSaving(true)
    if (isEdit) await supabase.from('race_goals').update(form).eq('id', editGoal.id)
    else await supabase.from('race_goals').insert(form)
    setSaving(false); setModal(null); onSaved(); showToast(isEdit ? 'Mis à jour ✓' : 'Objectif ajouté ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)}>
      <div className="modal-title">{isEdit ? 'Modifier l\'objectif' : 'Nouvel objectif de course'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FG label="ATHLÈTE">
          <select className="input" value={form.athlete_id} onChange={e => setForm(f => ({ ...f, athlete_id: e.target.value }))}>
            {athletes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </FG>
        <FG label="NOM DE LA COURSE"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: UTMB, Paris Marathon…" /></FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FG label="DATE"><input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></FG>
          <FG label="TYPE">
            <select className="input" value={form.goal_type} onChange={e => setForm(f => ({ ...f, goal_type: e.target.value }))}>
              <option value="primary">🎯 Objectif Principal</option>
              <option value="secondary">📌 Objectif Secondaire</option>
            </select>
          </FG>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FG label="LIEU"><input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="ex: Chamonix" /></FG>
          <FG label="DISTANCE"><input className="input" value={form.distance} onChange={e => setForm(f => ({ ...f, distance: e.target.value }))} placeholder="ex: 170km" /></FG>
        </div>
        <FG label="OBJECTIF TEMPS (optionnel)"><input className="input" value={form.target_time} onChange={e => setForm(f => ({ ...f, target_time: e.target.value }))} placeholder="ex: sub-3h, 2h45…" /></FG>
        <FG label="CONSIGNES COACH"><textarea className="input" value={form.coach_notes} onChange={e => setForm(f => ({ ...f, coach_notes: e.target.value }))} rows={3} placeholder="Stratégie de course, consignes spécifiques…" /></FG>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Mettre à jour' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}
