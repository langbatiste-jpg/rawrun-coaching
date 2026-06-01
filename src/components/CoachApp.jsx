import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { calculateZones, getWeekKey, generateTCX, downloadTCX } from '../utils'
import { SESSION_TYPES, DAYS, BASE_ZONES } from '../constants'
import { Overlay, FG, WeekNav } from './ui'
import ChatModal from './ChatModal'

export default function CoachApp({ onLogout, showToast }) {
  const [view, setView] = useState('dashboard')
  const [athletes, setAthletes] = useState([])
  const [sessions, setSessions] = useState([])
  const [completions, setCompletions] = useState({})
  const [notifications, setNotifications] = useState([])
  const [modal, setModal] = useState(null)
  const [editAthlete, setEditAthlete] = useState(null)
  const [editSession, setEditSession] = useState(null)
  const [editSlot, setEditSlot] = useState(null)
  const [chatTarget, setChatTarget] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)
  const [weekData, setWeekData] = useState({})
  const weekKey = getWeekKey(weekOffset)
  const unread = notifications.filter(n => !n.read).length

  useEffect(() => { loadAll() }, [])

  // Realtime notifications
  useEffect(() => {
    const ch = supabase.channel('notifs_coach')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => loadNotifications())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'completions' }, () => { loadNotifications(); loadCompletions() })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const loadAll = async () => {
    await Promise.all([loadAthletes(), loadSessions(), loadNotifications(), loadCompletions(), loadWeekData()])
  }
  const loadAthletes = async () => {
    const { data } = await supabase.from('athletes').select('*').order('name')
    setAthletes(data || [])
  }
  const loadSessions = async () => {
    const { data } = await supabase.from('sessions').select('*').order('created_at', { ascending: false })
    setSessions(data || [])
  }
  const loadNotifications = async () => {
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)
    setNotifications(data || [])
  }
  const loadCompletions = async () => {
    const { data } = await supabase.from('completions').select('*')
    const map = {}
    data?.forEach(c => { map[c.session_key] = c })
    setCompletions(map)
  }
  const loadWeekData = async () => {
    const { data } = await supabase.from('week_slots').select('*')
    const map = {}
    data?.forEach(s => { map[`${s.athlete_id}__${s.week_key}__${s.day_index}`] = s })
    setWeekData(map)
  }

  const getAthleteWeek = (athleteId, wk) => {
    return DAYS.map((_, i) => weekData[`${athleteId}__${wk}__${i}`] || null)
  }

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('read', false)
    loadNotifications()
  }

  const openChat = (athleteId, sessionKey, sessionName) => {
    const athlete = athletes.find(a => a.id === athleteId)
    setChatTarget({ athleteId, sessionKey, sessionName, athleteName: athlete?.name })
    // Mark notifs read for this session
    supabase.from('notifications').update({ read: true }).eq('session_key', sessionKey).then(loadNotifications)
  }

  return (
    <div>
      {/* NAV */}
      <nav className="rr-nav">
        <div className="rr-nav-logo">RAW<span>RUN</span> <span className="rr-nav-role">coach</span></div>
        <div className="rr-nav-spacer" />
        {[
          ['dashboard', 'Vue globale'],
          ['athletes', 'Athlètes'],
          ['sessions', 'Séances'],
          ['planning', 'Planning'],
        ].map(([v, l]) => (
          <button key={v} className={`rr-nav-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{l}</button>
        ))}
        <button className={`rr-nav-btn ${view === 'notifications' ? 'active' : ''}`}
          onClick={() => { setView('notifications'); markAllRead() }}
          style={{ position: 'relative' }}>
          🔔 {unread > 0 && <span className="notif-dot" style={{ position: 'absolute', top: 6, right: 6 }} />}
        </button>
        <button className="btn-ghost" style={{ fontSize: 12, marginLeft: 8 }} onClick={onLogout}>← Déco</button>
      </nav>

      <div className="rr-content">
        {view === 'dashboard' && <Dashboard athletes={athletes} weekKey={weekKey} weekOffset={weekOffset} setWeekOffset={setWeekOffset} getAthleteWeek={getAthleteWeek} completions={completions} notifications={notifications} setSelectedAthleteId={setSelectedAthleteId} setView={setView} />}
        {view === 'athletes' && <Athletes athletes={athletes} onAdd={() => { setEditAthlete(null); setModal('athlete') }} onEdit={a => { setEditAthlete(a); setModal('athlete') }} onDelete={loadAthletes} showToast={showToast} />}
        {view === 'sessions' && <Sessions sessions={sessions} onAdd={() => { setEditSession(null); setModal('session') }} onEdit={s => { setEditSession(s); setModal('session') }} onDelete={loadSessions} showToast={showToast} />}
        {view === 'planning' && <Planning athletes={athletes} sessions={sessions} weekKey={weekKey} weekOffset={weekOffset} setWeekOffset={setWeekOffset} selectedAthleteId={selectedAthleteId} setSelectedAthleteId={setSelectedAthleteId} getAthleteWeek={getAthleteWeek} completions={completions} notifications={notifications} setEditSlot={setEditSlot} setModal={setModal} openChat={openChat} loadWeekData={loadWeekData} />}
        {view === 'notifications' && <Notifications notifications={notifications} athletes={athletes} openChat={openChat} />}
      </div>

      {modal === 'athlete' && <ModalAthlete editAthlete={editAthlete} setModal={setModal} onSaved={loadAthletes} showToast={showToast} />}
      {modal === 'session' && <ModalSession editSession={editSession} setModal={setModal} onSaved={loadSessions} showToast={showToast} />}
      {modal === 'slot' && editSlot && <ModalSlot slot={editSlot} sessions={sessions} athletes={athletes} setModal={setModal} onSaved={loadWeekData} showToast={showToast} />}
      {chatTarget && <ChatModal {...chatTarget} isCoach completion={completions[chatTarget.sessionKey]} onClose={() => setChatTarget(null)} />}
    </div>
  )
}

// ── Dashboard ──
function Dashboard({ athletes, weekKey, weekOffset, setWeekOffset, getAthleteWeek, completions, notifications, setSelectedAthleteId, setView }) {
  const totalKm = athletes.reduce((acc, a) => {
    const w = getAthleteWeek(a.id, weekKey)
    return acc + w.reduce((s, d) => s + (d?.km || 0), 0)
  }, 0)
  const completedCount = Object.keys(completions).filter(k => k.includes(weekKey)).length

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
        {[{ v: athletes.length, l: 'Athlètes' }, { v: totalKm + ' km', l: 'Volume planifié' }, { v: completedCount, l: 'Séances réalisées' }].map((s, i) => (
          <div key={i} className="card"><div className="stat-val">{s.v}</div><div className="stat-label">{s.l}</div></div>
        ))}
      </div>
      {athletes.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#475569' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👟</div>
          <div>Va dans "Athlètes" pour en ajouter.</div>
        </div>
      )}
      {athletes.map(a => {
        const w = getAthleteWeek(a.id, weekKey)
        const kmTot = w.reduce((s, d) => s + (d?.km || 0), 0)
        const done = w.filter((_, i) => !!completions[`${a.id}__${weekKey}__${i}`]).length
        const planned = w.filter(d => d && d.session_type !== 'REPOS').length
        const hasUnread = notifications.some(n => n.athlete_id === a.id && !n.read)
        return (
          <div key={a.id} className="card card-hover" style={{ marginBottom: 10, borderLeft: `3px solid ${hasUnread ? '#e11d48' : '#1e293b'}` }}
            onClick={() => { setSelectedAthleteId(a.id); setView('planning') }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div className="avatar">{a.name.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</span>
                  {hasUnread && <span className="notif-dot" />}
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{a.goal || '—'} · Code: <b style={{ color: '#94a3b8' }}>{a.code}</b></div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div>{kmTot} km</div>
                <div style={{ color: '#64748b' }}>{done}/{planned} réalisées</div>
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

// ── Athletes ──
function Athletes({ athletes, onAdd, onEdit, onDelete, showToast }) {
  const deleteAthlete = async (id, name) => {
    if (!confirm(`Supprimer ${name} ?`)) return
    await supabase.from('athletes').delete().eq('id', id)
    onDelete()
    showToast('Athlète supprimé')
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-title">Athlètes</div>
        <button className="btn-primary" onClick={onAdd}>+ Ajouter</button>
      </div>
      {athletes.length === 0 && <div style={{ color: '#475569', fontSize: 14, padding: 48, textAlign: 'center' }}>Aucun athlète.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {athletes.map(a => {
          const zones = a.perf_5k ? calculateZones(a.perf_5k, 5) : (a.perf_10k ? calculateZones(a.perf_10k, 10) : null)
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
                {a.perf_10k && <span className="tag">10km: {a.perf_10k}</span>}
              </div>
              {zones && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, letterSpacing: '0.06em' }}>ZONES AUTO-CALCULÉES</div>
                  {zones.slice(0, 5).map(z => (
                    <div key={z.id} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11 }}>
                      <div style={{ width: 5, height: 5, borderRadius: 1, background: z.color, marginTop: 4, flexShrink: 0 }} />
                      <span style={{ color: '#64748b', width: 70, flexShrink: 0 }}>Z{z.id} {z.short}</span>
                      <span style={{ color: '#e2e8f0' }}>{z.paceMax} – {z.paceMin} /km</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>+{zones.length - 5} zones…</div>
                </div>
              )}
              {a.notes && <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px solid #1e293b', paddingTop: 10 }}>{a.notes}</div>}
              <div style={{ marginTop: 12 }}>
                <button className="btn-danger" style={{ fontSize: 11 }} onClick={() => deleteAthlete(a.id, a.name)}>Supprimer</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Sessions ──
function Sessions({ sessions, onAdd, onEdit, onDelete, showToast }) {
  const deleteSession = async (id) => {
    if (!confirm('Supprimer cette séance ?')) return
    await supabase.from('sessions').delete().eq('id', id)
    onDelete()
    showToast('Séance supprimée')
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div className="page-title">Bibliothèque de séances</div>
        <button className="btn-primary" onClick={onAdd}>+ Créer</button>
      </div>
      {sessions.length === 0 && <div style={{ color: '#475569', fontSize: 14, padding: 48, textAlign: 'center' }}>Aucune séance.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
        {sessions.map(s => {
          const st = SESSION_TYPES.find(t => t.id === s.session_type)
          const blocks = s.blocks || []
          return (
            <div key={s.id} className="card" style={{ borderLeft: `3px solid ${st?.color || '#334155'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div><div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div><div style={{ fontSize: 12, color: st?.color }}>{st?.label}</div></div>
                {s.km > 0 && <span className="tag">{s.km} km</span>}
              </div>
              {s.description && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 1.5 }}>{s.description}</div>}
              {blocks.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {blocks.map((b, i) => {
                    const z = BASE_ZONES[b.zone - 1]
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, fontSize: 11 }}>
                        <div style={{ width: 5, height: 5, borderRadius: 1, background: z?.color, flexShrink: 0 }} />
                        <span style={{ color: '#64748b' }}>{b.reps > 1 ? `${b.reps}× ` : ''}{b.name || `Z${b.zone}`}</span>
                        <span style={{ color: '#94a3b8', marginLeft: 'auto' }}>{b.duration_type === 'time' ? `${Math.floor(b.duration / 60)}min` : `${b.distance}m`}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
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

// ── Planning ──
function Planning({ athletes, sessions, weekKey, weekOffset, setWeekOffset, selectedAthleteId, setSelectedAthleteId, getAthleteWeek, completions, notifications, setEditSlot, setModal, openChat, loadWeekData }) {
  const athlete = athletes.find(a => a.id === selectedAthleteId)
  const weekSlots = selectedAthleteId ? getAthleteWeek(selectedAthleteId, weekKey) : Array(7).fill(null)
  const kmTotal = weekSlots.reduce((s, d) => s + (d?.km || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div className="page-title">Planning</div>
          <div className="page-sub">{athlete ? athlete.name : 'Sélectionne un athlète'} · {weekKey} {kmTotal > 0 ? `· ${kmTotal} km` : ''}</div>
        </div>
        <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {athletes.map(a => (
          <button key={a.id} className={selectedAthleteId === a.id ? 'btn-primary' : 'btn-ghost'} style={{ fontSize: 12 }}
            onClick={() => setSelectedAthleteId(a.id)}>{a.name}</button>
        ))}
      </div>
      {selectedAthleteId && (
        <div className="week-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
          {DAYS.map((day, i) => {
            const slot = weekSlots[i]
            const st = slot?.session_type ? SESSION_TYPES.find(t => t.id === slot.session_type) : null
            const sess = slot?.session_id ? sessions.find(s => s.id === slot.session_id) : null
            const compKey = `${selectedAthleteId}__${weekKey}__${i}`
            const comp = completions[compKey]
            const msgKey = compKey
            const hasUnread = notifications.some(n => n.session_key === msgKey && !n.read)
            return (
              <div key={i} className="day-cell" style={{ borderTop: `2px solid ${comp ? '#4ade80' : st?.color || '#1e293b'}` }}>
                <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.06em', marginBottom: 8 }}>{day.toUpperCase()}</div>
                {slot?.session_type && slot.session_type !== 'REPOS' ? (
                  <>
                    <div style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, background: (st?.color || '#334155') + '22', color: st?.color, display: 'inline-block', marginBottom: 5 }}>{st?.label?.split(' ')[0]}</div>
                    {slot.km > 0 && <div style={{ fontSize: 14, fontWeight: 600 }}>{slot.km} km</div>}
                    {sess && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{sess.name}</div>}
                    {comp && <div style={{ fontSize: 10, color: '#4ade80', marginTop: 4 }}>✓ RPE {comp.rpe}</div>}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 7px', flex: 1 }}
                        onClick={() => { setEditSlot({ athleteId: selectedAthleteId, weekKey, dayIndex: i, existing: slot }); setModal('slot') }}>Éditer</button>
                      <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 7px', color: hasUnread ? '#e11d48' : 'inherit', position: 'relative' }}
                        onClick={() => openChat(selectedAthleteId, msgKey, sess?.name || st?.label || day)}>
                        💬 {hasUnread && <span className="notif-dot" style={{ position: 'absolute', top: 1, right: 1, width: 5, height: 5 }} />}
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
    </div>
  )
}

// ── Notifications ──
function Notifications({ notifications, athletes, openChat }) {
  return (
    <div>
      <div className="page-title" style={{ marginBottom: 24 }}>Notifications</div>
      {notifications.length === 0 && <div style={{ color: '#475569', fontSize: 14, padding: 48, textAlign: 'center' }}>Aucune notification.</div>}
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
              {!n.read && <span className="notif-dot" />}
            </div>
            {n.detail && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>{n.detail}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Modal Athlete ──
function ModalAthlete({ editAthlete, setModal, onSaved, showToast }) {
  const isEdit = !!editAthlete
  const [form, setForm] = useState(isEdit ? {
    name: editAthlete.name, code: editAthlete.code, goal: editAthlete.goal || '',
    perf_5k: editAthlete.perf_5k || '', perf_10k: editAthlete.perf_10k || '', notes: editAthlete.notes || ''
  } : { name: '', code: '', goal: '', perf_5k: '', perf_10k: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const calcZ = form.perf_5k ? calculateZones(form.perf_5k, 5) : (form.perf_10k ? calculateZones(form.perf_10k, 10) : null)

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return showToast('Nom et code requis', 'err')
    setSaving(true)
    const data = { name: form.name.trim(), code: form.code.trim().toUpperCase(), goal: form.goal, perf_5k: form.perf_5k, perf_10k: form.perf_10k, notes: form.notes }
    if (isEdit) await supabase.from('athletes').update(data).eq('id', editAthlete.id)
    else await supabase.from('athletes').insert(data)
    setSaving(false)
    setModal(null)
    onSaved()
    showToast(isEdit ? 'Mis à jour ✓' : 'Athlète ajouté ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)}>
      <div className="modal-title">{isEdit ? 'Modifier' : 'Nouvel athlète'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FG label="NOM COMPLET"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FG>
        <FG label="CODE D'ACCÈS"><input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="ex: YOANN23" /></FG>
        <FG label="OBJECTIF"><input className="input" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="ex: UTMB, Marathon…" /></FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FG label="PERF 5KM (mm:ss)"><input className="input" value={form.perf_5k} onChange={e => setForm(f => ({ ...f, perf_5k: e.target.value }))} placeholder="22:30" /></FG>
          <FG label="PERF 10KM (mm:ss)"><input className="input" value={form.perf_10k} onChange={e => setForm(f => ({ ...f, perf_10k: e.target.value }))} placeholder="47:00" /></FG>
        </div>
        {calcZ && (
          <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, letterSpacing: '0.06em' }}>ZONES AUTO-CALCULÉES</div>
            {calcZ.map(z => (
              <div key={z.id} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 11 }}>
                <div style={{ width: 5, height: 5, borderRadius: 1, background: z.color, marginTop: 4, flexShrink: 0 }} />
                <span style={{ color: '#64748b', width: 70, flexShrink: 0 }}>Z{z.id} {z.short}</span>
                <span style={{ color: '#e2e8f0' }}>{z.paceMax} – {z.paceMin} /km</span>
              </div>
            ))}
          </div>
        )}
        <FG label="NOTES COACH"><textarea className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></FG>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Sauvegarde…' : isEdit ? 'Mettre à jour' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ── Modal Session ──
function ModalSession({ editSession, setModal, onSaved, showToast }) {
  const isEdit = !!editSession
  const [draft, setDraft] = useState(isEdit ? { name: editSession.name, session_type: editSession.session_type, description: editSession.description || '', km: editSession.km || '', notes: editSession.notes || '', blocks: editSession.blocks || [] } : { name: '', session_type: 'EF', description: '', km: '', notes: '', blocks: [] })
  const [addingBlock, setAddingBlock] = useState(false)
  const [block, setBlock] = useState({ name: '', zone: 1, duration_type: 'time', duration: 600, distance: 1000, reps: 1 })
  const [saving, setSaving] = useState(false)

  const addBlock = () => {
    setDraft(d => ({ ...d, blocks: [...d.blocks, { ...block, id: Date.now().toString() }] }))
    setAddingBlock(false)
    setBlock({ name: '', zone: 1, duration_type: 'time', duration: 600, distance: 1000, reps: 1 })
  }

  const save = async () => {
    if (!draft.name.trim()) return showToast('Nom requis', 'err')
    setSaving(true)
    if (isEdit) await supabase.from('sessions').update(draft).eq('id', editSession.id)
    else await supabase.from('sessions').insert(draft)
    setSaving(false); setModal(null); onSaved(); showToast(isEdit ? 'Mis à jour ✓' : 'Séance créée ✓')
  }

  const exportTCX = () => {
    if (!draft.blocks.length) return showToast('Ajoute des blocs', 'err')
    const steps = draft.blocks.map(b => { const z = BASE_ZONES[b.zone - 1]; return { name: b.name || `Z${b.zone}`, durationType: b.duration_type, duration: b.duration, distance: b.distance, paceMin: z?.paceMin, paceMax: z?.paceMax } })
    downloadTCX(generateTCX(draft.name, steps), draft.name.replace(/\s+/g, '_'))
    showToast('TCX téléchargé ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)} wide>
      <div className="modal-title">{isEdit ? 'Modifier la séance' : 'Nouvelle séance'}</div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FG label="NOM"><input className="input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></FG>
          <FG label="TYPE"><select className="input" value={draft.session_type} onChange={e => setDraft(d => ({ ...d, session_type: e.target.value }))}>
            {SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select></FG>
          <FG label="DESCRIPTION / CONSIGNES"><textarea className="input" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} rows={3} /></FG>
          <FG label="KM PRÉVU"><input className="input" type="number" step="0.5" value={draft.km} onChange={e => setDraft(d => ({ ...d, km: e.target.value }))} /></FG>
          <FG label="NOTES COACH (privées)"><textarea className="input" value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={2} /></FG>
        </div>
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>BLOCS DE SÉANCE</div>
          {draft.blocks.map((b, i) => {
            const z = BASE_ZONES[b.zone - 1]
            return (
              <div key={b.id || i} style={{ background: '#0a0f1a', borderRadius: 8, padding: 9, border: `1px solid ${z?.color}33`, display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 5, height: 5, borderRadius: 1, background: z?.color, flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 11 }}>
                  <div style={{ color: '#e2e8f0' }}>{b.reps > 1 ? `${b.reps}× ` : ''}{b.name || `Z${b.zone} ${z?.short}`}</div>
                  <div style={{ color: '#64748b' }}>{b.duration_type === 'time' ? `${Math.floor(b.duration / 60)}min` : `${b.distance}m`} · {z?.paceMax}→{z?.paceMin}</div>
                </div>
                <button style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }} onClick={() => setDraft(d => ({ ...d, blocks: d.blocks.filter((_, j) => j !== i) }))}>×</button>
              </div>
            )
          })}
          {addingBlock ? (
            <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="input" value={block.name} onChange={e => setBlock(b => ({ ...b, name: e.target.value }))} placeholder="Nom du bloc" style={{ fontSize: 12 }} />
              <select className="input" value={block.zone} onChange={e => setBlock(b => ({ ...b, zone: Number(e.target.value) }))} style={{ fontSize: 12 }}>
                {BASE_ZONES.map(z => <option key={z.id} value={z.id}>Z{z.id} — {z.name}</option>)}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select className="input" value={block.duration_type} onChange={e => setBlock(b => ({ ...b, duration_type: e.target.value }))} style={{ fontSize: 12 }}>
                  <option value="time">Temps (sec)</option>
                  <option value="distance">Distance (m)</option>
                </select>
                {block.duration_type === 'time'
                  ? <input className="input" type="number" value={block.duration} onChange={e => setBlock(b => ({ ...b, duration: Number(e.target.value) }))} style={{ fontSize: 12 }} placeholder="sec" />
                  : <input className="input" type="number" value={block.distance} onChange={e => setBlock(b => ({ ...b, distance: Number(e.target.value) }))} style={{ fontSize: 12 }} placeholder="m" />}
              </div>
              <input className="input" type="number" value={block.reps} min={1} onChange={e => setBlock(b => ({ ...b, reps: Number(e.target.value) }))} placeholder="Répétitions" style={{ fontSize: 12 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setAddingBlock(false)}>Annuler</button>
                <button className="btn-primary" style={{ fontSize: 11, flex: 1 }} onClick={addBlock}>Ajouter</button>
              </div>
            </div>
          ) : <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setAddingBlock(true)}>+ Ajouter un bloc</button>}
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

// ── Modal Slot ──
function ModalSlot({ slot, sessions, athletes, setModal, onSaved, showToast }) {
  const { athleteId, weekKey, dayIndex, existing } = slot
  const [form, setForm] = useState({ session_type: existing?.session_type || 'REPOS', session_id: existing?.session_id || '', km: existing?.km || '', note: existing?.note || '' })
  const [saving, setSaving] = useState(false)
  const selectedSess = sessions.find(s => s.id === form.session_id)
  const athlete = athletes.find(a => a.id === athleteId)
  const zones = athlete?.perf_5k ? calculateZones(athlete.perf_5k, 5) : BASE_ZONES

  const save = async () => {
    setSaving(true)
    const data = { athlete_id: athleteId, week_key: weekKey, day_index: dayIndex, session_type: form.session_type, session_id: form.session_id || null, km: Number(form.km) || 0, note: form.note }
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
        <FG label="TYPE"><select className="input" value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))}>
          {SESSION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select></FG>
        {form.session_type !== 'REPOS' && <>
          <FG label="SÉANCE (optionnel)"><select className="input" value={form.session_id} onChange={e => { const s = sessions.find(x => x.id === e.target.value); setForm(f => ({ ...f, session_id: e.target.value, km: s?.km || f.km })) }}>
            <option value="">— Séance libre —</option>
            {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></FG>
          {selectedSess?.blocks?.length > 0 && (
            <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 12 }}>
              {selectedSess.blocks.map((b, i) => { const z = zones[b.zone - 1]; return (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 1, background: z?.color, flexShrink: 0, marginTop: 4 }} />
                  <span style={{ color: '#64748b' }}>{b.reps > 1 ? `${b.reps}× ` : ''}{b.name || `Z${b.zone}`}</span>
                  <span style={{ color: '#e2e8f0', marginLeft: 'auto' }}>{z?.paceMax} – {z?.paceMin}</span>
                </div>
              )})}
            </div>
          )}
          <FG label="KILOMÉTRAGE"><input className="input" type="number" step="0.5" value={form.km} onChange={e => setForm(f => ({ ...f, km: e.target.value }))} /></FG>
          <FG label="NOTE POUR L'ATHLÈTE"><textarea className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={3} placeholder="Consignes spécifiques…" /></FG>
        </>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button className="btn-danger" style={{ fontSize: 12 }} onClick={clear}>Effacer le jour</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-ghost" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : 'Valider'}</button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}
