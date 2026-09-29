import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import { api } from '../api'
import { getWeekKey, generateTCX, downloadTCX, daysUntil, getStravaAuthUrl, isoDate } from '../utils'
import { SESSION_TYPES, DAYS, RPE_LABELS, RPE_COLORS } from '../constants'
import { athleteZones, calcTotalMinutes } from '../../shared/training.js'
import { Overlay, FG, WeekNav, ZoneBadge } from './ui'
import Icon from './Icon'
import ChatModal from './ChatModal'
import MonthCalendar from './MonthCalendar'
import { WellnessCheckIn } from './WellnessCheck'
import { StrengthSessionView } from './StrengthBuilder'
import SessionBar from './SessionBar'
import InstallApp from './InstallApp'

const TABS = [['week', 'Semaine', 'week'], ['month', 'Calendrier', 'planning'], ['zones', 'Allures', 'zones'], ['goals', 'Objectifs', 'goals'], ['more', 'Plus', 'athletes']]
const stType = id => SESSION_TYPES.find(t => t.id === id)
const dayDate = (wk, i) => { const d = new Date(wk + 'T12:00'); d.setDate(d.getDate() + i); return d }

export default function AthleteApp({ athlete, onAthleteUpdate, onLogout, showToast }) {
  const [view, setView] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [slotMap, setSlotMap] = useState({})
  const [sessions, setSessions] = useState([])
  const [strength, setStrength] = useState([])
  const [completions, setCompletions] = useState({})
  const [raceGoals, setRaceGoals] = useState([])
  const [strava, setStrava] = useState([])
  const [detail, setDetail] = useState(null)
  const [chatTarget, setChatTarget] = useState(null)
  const [wellnessDone, setWellnessDone] = useState(false)
  const weekKey = getWeekKey(weekOffset)
  const zones = useMemo(() => athleteZones(athlete), [athlete])

  useEffect(() => {
    loadAll()
    // Rafraîchit le profil (records, zones) mis à jour par le coach
    if (athlete.code) api('athlete-auth', { action: 'code', code: athlete.code }).then(r => r?.athlete && onAthleteUpdate(r.athlete)).catch(() => {})
    // Retour de connexion Strava
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code && params.get('state') === athlete.id) {
      window.history.replaceState({}, '', window.location.pathname)
      showToast('Connexion Strava…')
      api('strava', { action: 'connect', athlete_id: athlete.id, code })
        .then(r => { showToast(`Strava connecté · ${r.imported} sorties importées ✓`); loadStrava(); setView('more') })
        .catch(e => showToast(e.message, 'err'))
    }
    const ch = supabase.channel(`athlete_${athlete.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_slots', filter: `athlete_id=eq.${athlete.id}` }, loadSlots)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const loadAll = () => Promise.all([loadSlots(), loadSessions(), loadCompletions(), loadGoals(), loadStrava()])
  const loadSlots = async () => { const { data } = await supabase.from('week_slots').select('*').eq('athlete_id', athlete.id); const m = {}; data?.forEach(s => { m[`${athlete.id}__${s.week_key}__${s.day_index}`] = s }); setSlotMap(m) }
  const loadSessions = async () => {
    const [{ data: s }, { data: st }] = await Promise.all([supabase.from('sessions').select('*'), supabase.from('strength_sessions').select('*')])
    setSessions(s || []); setStrength(st || [])
  }
  const loadCompletions = async () => { const { data } = await supabase.from('completions').select('*').eq('athlete_id', athlete.id); const m = {}; data?.forEach(c => { m[c.session_key] = c }); setCompletions(m) }
  const loadGoals = async () => { const { data } = await supabase.from('race_goals').select('*').eq('athlete_id', athlete.id).order('date'); setRaceGoals(data || []) }
  const loadStrava = async () => { const { data } = await supabase.from('strava_activities').select('*').eq('athlete_id', athlete.id).order('start_date', { ascending: false }).limit(10); setStrava(data || []) }

  const getSlot = (aId, wk, i) => slotMap[`${aId}__${wk}__${i}`] || null
  const openDay = (wk, i) => {
    const slot = getSlot(athlete.id, wk, i)
    if (!slot || slot.session_type === 'REPOS') return
    setDetail({ slot, wk, dayIndex: i, sess: sessions.find(s => s.id === slot.session_id), ssess: strength.find(s => s.id === slot.strength_session_id), compKey: `${athlete.id}__${wk}__${i}` })
  }
  const openChat = (sessionKey, sessionName) => setChatTarget({ athleteId: athlete.id, sessionKey, sessionName, athleteName: athlete.name })

  const nextRace = raceGoals.filter(g => daysUntil(g.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0]
  const todayIdx = (new Date().getDay() + 6) % 7
  const thisWeek = getWeekKey(0)
  const todaySlot = getSlot(athlete.id, thisWeek, todayIdx)
  const firstName = athlete.name.split(' ')[0]

  return (
    <div className="rr-shell">
      <header className="rr-topbar">
        <div className="rr-nav-logo">RAW<span>RUN</span></div>
        <div style={{ flex: 1 }} />
        <div className="avatar" style={{ width: 32, height: 32, fontSize: 14, borderRadius: 10 }}>{athlete.name.slice(0, 2).toUpperCase()}</div>
      </header>
      <nav className="rr-nav" aria-label="Navigation">
        <div className="rr-nav-logo">RAW<span>RUN</span></div>
        <span className="rr-nav-role">{athlete.name}</span>
        {TABS.map(([v, l, ic]) => <button key={v} className={`rr-nav-btn ${view === v ? 'active' : ''}`} onClick={() => { setView(v); window.scrollTo({ top: 0 }) }}><Icon name={ic} />{l}</button>)}
        <div className="rr-nav-spacer" />
        <button className="rr-nav-btn desk-only" onClick={onLogout}><Icon name="logout" />Déconnexion</button>
      </nav>

      <main className="rr-main">
        <div className="rr-content" key={view} style={{ maxWidth: 820 }}>
          {view === 'week' && (
            <div className="view-enter">
              <div className="athlete-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 22 }}>
                <div>
                  <div className="muted" style={{ fontSize: 14 }}>Salut {firstName}</div>
                  <div className="page-title">{todaySlot && todaySlot.session_type !== 'REPOS' ? "Au programme aujourd'hui" : 'Récup aujourd\'hui'}</div>
                </div>
                {nextRace && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="display" style={{ fontSize: 64, color: 'var(--accent)' }}>J-{daysUntil(nextRace.date)}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{nextRace.name}</div>
                  </div>
                )}
              </div>

              {todaySlot && todaySlot.session_type !== 'REPOS' && (
                <TodayCard slot={todaySlot} sess={sessions.find(s => s.id === todaySlot.session_id)} zones={zones} done={completions[`${athlete.id}__${thisWeek}__${todayIdx}`]} onOpen={() => openDay(thisWeek, todayIdx)} />
              )}

              {!wellnessDone && <WellnessCheckIn compact athleteId={athlete.id} onDone={() => { setWellnessDone(true); showToast('Merci, ton coach est au courant ✓') }} />}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '26px 0 12px', gap: 10, flexWrap: 'wrap' }}>
                <b>Semaine du {new Date(weekKey + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</b>
                <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />
              </div>
              <WeekList {...{ athlete, weekKey, getSlot, sessions, strength, completions, zones, openDay, todayIdx: weekOffset === 0 ? todayIdx : -1 }} />
            </div>
          )}

          {view === 'month' && (
            <div className="view-enter">
              <div className="page-title" style={{ marginBottom: 20 }}>Calendrier</div>
              <MonthCalendar athleteId={athlete.id} getSlot={getSlot} sessions={sessions} completions={completions} raceGoals={raceGoals} onSlotClick={({ weekKey: wk, dayIndex }) => openDay(wk, dayIndex)} />
            </div>
          )}

          {view === 'zones' && (
            <div className="view-enter">
              <div className="page-title">Mes allures</div>
              <div className="page-sub" style={{ marginBottom: 20 }}>
                {athlete.records?.length ? `Calculées à partir de tes records : ${athlete.records.map(r => `${r.distance} en ${r.time}`).join(', ')}` : athlete.perf_5k ? `Calculées sur ton 5 km en ${athlete.perf_5k}` : 'Ton coach doit renseigner un record pour calculer tes allures.'}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>{zones.map(z => <ZoneBadge key={z.id} zone={z} paceMin={z.paceMin} paceMax={z.paceMax} />)}</div>
            </div>
          )}

          {view === 'goals' && (
            <div className="view-enter">
              <div className="page-title" style={{ marginBottom: 20 }}>Mes objectifs</div>
              {!raceGoals.length && <div className="card muted" style={{ textAlign: 'center', padding: 36 }}>Ton coach n'a pas encore ajouté de course.</div>}
              <div style={{ display: 'grid', gap: 12 }}>
                {raceGoals.map(g => {
                  const days = daysUntil(g.date)
                  return (
                    <div key={g.id} className="card" style={{ opacity: days < 0 ? .55 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 17 }}>{g.name}</div>
                          <div className="muted" style={{ fontSize: 13 }}>{[g.distance, g.location, new Date(g.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })].filter(Boolean).join(' · ')}</div>
                          {g.target_time && <div style={{ marginTop: 6 }}>Objectif <b className="num">{g.target_time}</b></div>}
                        </div>
                        <div className="display" style={{ fontSize: 48, color: days < 0 ? 'var(--text-4)' : g.goal_type === 'primary' ? 'var(--accent)' : 'var(--text-2)' }}>{days < 0 ? '✓' : `J-${days}`}</div>
                      </div>
                      {g.coach_notes && <div className="panel" style={{ marginTop: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{g.coach_notes}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {view === 'more' && (
            <div className="view-enter" style={{ display: 'grid', gap: 12 }}>
              <div className="page-title" style={{ marginBottom: 8 }}>Plus</div>
              <InstallApp />
              <StravaCard athlete={athlete} activities={strava} showToast={showToast} onSynced={loadStrava} />
              <div className="card"><div className="muted" style={{ fontSize: 13 }}>Ton code d'accès</div><div className="num" style={{ fontSize: 22, letterSpacing: '.1em' }}>{athlete.code}</div></div>
              <button className="btn-danger" onClick={onLogout} style={{ justifySelf: 'start' }}>Se déconnecter</button>
            </div>
          )}
        </div>
      </main>

      {detail && <SessionModal {...detail} athlete={athlete} zones={zones} completion={completions[detail.compKey]} onClose={() => setDetail(null)} showToast={showToast}
        onDone={() => loadCompletions()} openChat={openChat} />}
      {chatTarget && <ChatModal {...chatTarget} isCoach={false} completion={completions[chatTarget.sessionKey]} onClose={() => setChatTarget(null)} />}
    </div>
  )
}

function TodayCard({ slot, sess, zones, done, onOpen }) {
  const st = stType(slot.session_type)
  const mins = sess?.blocks?.length ? calcTotalMinutes(sess.blocks, zones) : 0
  return (
    <button className="card card-hover" onClick={onOpen} style={{ width: '100%', textAlign: 'left', color: 'var(--text)', marginBottom: 16, borderColor: done ? 'rgba(200,255,46,.4)' : 'rgba(255,90,31,.35)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <span className="pill" style={{ background: st?.color + '22', color: st?.color }}>{st?.label}</span>
          <div className="display" style={{ fontSize: 34, marginTop: 8 }}>{sess?.name || st?.label}</div>
        </div>
        <div className="num" style={{ textAlign: 'right', fontSize: 15, whiteSpace: 'nowrap' }}>
          {slot.km > 0 && <div>{slot.km} km</div>}
          {mins > 0 && <div className="muted" style={{ fontSize: 13 }}>~{mins} min</div>}
        </div>
      </div>
      {sess?.blocks?.length > 0 && <SessionBar blocks={sess.blocks} />}
      {slot.note && <div style={{ color: 'var(--lime)', fontSize: 13.5, marginTop: 12 }}>{slot.note}</div>}
      <div style={{ marginTop: 14, fontWeight: 600, color: done ? 'var(--lime)' : 'var(--accent)' }}>{done ? `✓ Validée · RPE ${done.rpe}` : 'Voir le détail et valider'}</div>
    </button>
  )
}

function WeekList({ athlete, weekKey, getSlot, sessions, strength, completions, openDay, todayIdx }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {DAYS.map((day, i) => {
        const slot = getSlot(athlete.id, weekKey, i)
        const st = slot?.session_type ? stType(slot.session_type) : null
        const sess = slot?.session_id ? sessions.find(s => s.id === slot.session_id) : null
        const ss = slot?.strength_session_id ? strength.find(s => s.id === slot.strength_session_id) : null
        const rest = !slot || slot.session_type === 'REPOS'
        const comp = completions[`${athlete.id}__${weekKey}__${i}`]
        return (
          <button key={i} className={`card ${rest ? '' : 'card-hover'}`} disabled={rest} onClick={() => openDay(weekKey, i)}
            style={{ display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left', color: 'var(--text)', padding: '12px 16px', opacity: rest ? .5 : 1, borderColor: todayIdx === i ? 'rgba(255,90,31,.45)' : undefined, borderLeft: `3px solid ${comp ? 'var(--lime)' : rest ? 'transparent' : st?.color}` }}>
            <div style={{ width: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{day}</div>
              <div className="display" style={{ fontSize: 24 }}>{dayDate(weekKey, i).getDate()}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {rest ? <span className="muted">Repos</span> : <>
                <div style={{ fontWeight: 600 }}>{sess?.name || st?.label}</div>
                <div style={{ fontSize: 12.5, color: st?.color }}>{st?.label}{slot.km > 0 ? ` · ${slot.km} km` : ''}{ss ? ' · 💪 renfo' : ''}</div>
                {comp && <div style={{ fontSize: 12.5, color: 'var(--lime)' }}>✓ Validée · RPE {comp.rpe}</div>}
              </>}
            </div>
            {!rest && !comp && <span style={{ color: 'var(--text-3)', fontSize: 18 }}>›</span>}
          </button>
        )
      })}
    </div>
  )
}

function SessionModal({ slot, sess, ssess, wk, dayIndex, compKey, athlete, zones, completion, onClose, onDone, openChat, showToast }) {
  const st = stType(slot.session_type)
  const [step, setStep] = useState('detail')
  const [rpe, setRpe] = useState(5)
  const [sensations, setSensations] = useState('')
  const [realKm, setRealKm] = useState(slot.km || '')
  const [realPace, setRealPace] = useState('')
  const [garminNote, setGarminNote] = useState('')
  const [saving, setSaving] = useState(false)
  const name = sess?.name || st?.label || 'Séance'
  const d0 = dayDate(wk, dayIndex).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const date = d0.charAt(0).toUpperCase() + d0.slice(1)

  const validate = async () => {
    setSaving(true)
    const { error } = await supabase.from('completions').upsert({ session_key: compKey, athlete_id: athlete.id, rpe, sensations, real_km: Number(realKm) || null, real_pace: realPace, garmin_note: garminNote }, { onConflict: 'session_key' })
    if (error) { setSaving(false); return showToast('Envoi impossible, réessaie', 'err') }
    const text = `✅ Séance terminée\n\nRPE ${rpe}/10 — ${RPE_LABELS[rpe]}\nDistance : ${realKm || '?'} km${realPace ? `\nAllure moyenne : ${realPace} /km` : ''}${sensations ? `\n\nSensations : ${sensations}` : ''}${garminNote ? `\n\nMontre : ${garminNote}` : ''}`
    await supabase.from('messages').insert({ session_key: compKey, athlete_id: athlete.id, from_role: 'athlete', text })
    await supabase.from('notifications').insert({ athlete_id: athlete.id, session_key: compKey, session_name: name, type: 'completion', title: `${athlete.name} a validé : ${name}`, detail: `RPE ${rpe}/10 · ${sensations || 'pas de commentaire'}`, read: false })
    api('notify', { type: 'completion', athlete_id: athlete.id, session_name: name, rpe, real_km: realKm, sensations }).catch(() => {})
    setSaving(false); setStep('done'); onDone()
  }

  return (
    <Overlay onClose={onClose}>
      {step === 'detail' && (
        <>
          <span className="pill" style={{ background: st?.color + '22', color: st?.color }}>{st?.label}</span>
          <div className="modal-title" style={{ margin: '10px 0 4px' }}>{name}</div>
          <div className="muted" style={{ marginBottom: 16 }}>{date}{slot.km > 0 ? ` · ${slot.km} km` : ''}</div>
          {slot.note && <div className="panel" style={{ color: 'var(--lime)', marginBottom: 12, lineHeight: 1.55 }}>{slot.note}</div>}
          {sess?.description && <p style={{ color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>{sess.description}</p>}
          {sess?.blocks?.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
              {sess.blocks.map((b, i) => b.isLoop ? (
                <div key={i} className="panel" style={{ borderColor: 'rgba(255,90,31,.3)' }}>
                  <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>{b.loopReps} × {b.name || ''}</div>
                  <div style={{ display: 'grid', gap: 5 }}>{(b.loopBlocks || []).map((lb, j) => <BlockRow key={j} b={lb} zones={zones} />)}</div>
                </div>
              ) : <BlockRow key={i} b={b} zones={zones} />)}
            </div>
          )}
          {ssess && <div style={{ marginBottom: 16 }}><div style={{ fontWeight: 600, marginBottom: 8, color: '#f472b6' }}>💪 {ssess.name}</div><StrengthSessionView session={ssess} /></div>}
          <div className="modal-foot">
            <div style={{ display: 'flex', gap: 8 }}>
              {sess?.blocks?.length > 0 && <button className="btn-ghost btn-sm" onClick={() => downloadTCX(generateTCX(name, sess.blocks, zones), name.replace(/\s+/g, '_'))}>⌚ Montre</button>}
              <button className="btn-ghost btn-sm" onClick={() => { onClose(); openChat(compKey, name) }}>💬 Coach</button>
            </div>
            {completion ? <span style={{ color: 'var(--lime)', fontWeight: 600 }}>✓ Validée · RPE {completion.rpe}</span>
              : <button className="btn-primary" onClick={() => setStep('feedback')}>J'ai fait la séance</button>}
          </div>
        </>
      )}

      {step === 'feedback' && (
        <>
          <div className="modal-title">Comment c'était ?</div>
          <FG label="Effort ressenti (RPE)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} className={`rpe-btn ${rpe === n ? 'active' : ''}`} style={{ color: RPE_COLORS[n], width: '100%' }} onClick={() => setRpe(n)}><span>{n}</span></button>)}
            </div>
            <div style={{ color: RPE_COLORS[rpe], fontWeight: 600, marginTop: 4 }}>{RPE_LABELS[rpe]}</div>
          </FG>
          <div className="grid-2" style={{ margin: '14px 0' }}>
            <FG label="Distance (km)"><input className="input num" type="number" inputMode="decimal" step="0.1" value={realKm} onChange={e => setRealKm(e.target.value)} /></FG>
            <FG label="Allure moyenne"><input className="input num" inputMode="numeric" value={realPace} onChange={e => setRealPace(e.target.value)} placeholder="4:32" /></FG>
          </div>
          <FG label="Sensations"><textarea className="input" rows={3} value={sensations} onChange={e => setSensations(e.target.value)} placeholder="Jambes, souffle, mental, météo…" /></FG>
          <div style={{ height: 12 }} />
          <FG label="Données montre (optionnel)"><input className="input" value={garminNote} onChange={e => setGarminNote(e.target.value)} placeholder="FC moyenne, dérive cardiaque…" /></FG>
          <div className="modal-foot">
            <button className="btn-ghost" onClick={() => setStep('detail')}>Retour</button>
            <button className="btn-primary" onClick={validate} disabled={saving}>{saving ? 'Envoi…' : 'Envoyer à mon coach'}</button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '28px 0' }}>
          <div className="display" style={{ fontSize: 64, color: 'var(--lime)' }}>Validé</div>
          <p className="muted" style={{ margin: '8px 0 24px' }}>Ton coach a reçu ton retour.</p>
          <button className="btn-primary" onClick={() => { onClose(); openChat(compKey, name) }}>Écrire à mon coach</button>
        </div>
      )}
    </Overlay>
  )
}

function BlockRow({ b, zones }) {
  const z = zones[b.zone - 1]
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', background: 'rgba(0,0,0,.3)', borderRadius: 10, borderLeft: `3px solid ${z?.color}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name || z?.name}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{b.durationType === 'time' ? `${b.duration} ${b.timeUnit}` : `${b.distance} ${b.distUnit}`} · Z{b.zone} {z?.short}{b.lapMode === 'lap' ? ' · bouton LAP' : ''}</div>
      </div>
      {z?.paceMax !== '—' && <div className="num" style={{ color: z?.color, fontSize: 15, textAlign: 'right' }}>{z.paceMax}–{z.paceMin}<div className="muted" style={{ fontSize: 10.5 }}>/km</div></div>}
    </div>
  )
}

function StravaCard({ athlete, activities, showToast, onSynced }) {
  const [busy, setBusy] = useState(false)
  const sync = async () => {
    setBusy(true)
    try { const r = await api('strava', { action: 'sync', athlete_id: athlete.id }); showToast(`${r.imported} sorties synchronisées ✓`); onSynced() }
    catch (e) { showToast(e.message, 'err') }
    setBusy(false)
  }
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ color: '#fc4c02' }}><Icon name="strava" size={26} /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>Strava</b>
          <div className="muted" style={{ fontSize: 13 }}>{activities.length ? 'Tes sorties remontent à ton coach.' : 'Connecte ton compte pour que ton coach voie tes sorties.'}</div>
        </div>
        {activities.length
          ? <button className="btn-ghost btn-sm" onClick={sync} disabled={busy}>{busy ? '…' : 'Synchroniser'}</button>
          : <a href={getStravaAuthUrl(athlete.id)} className="btn-primary" style={{ background: '#fc4c02', borderColor: '#fc4c02', color: '#fff', textDecoration: 'none' }}>Connecter</a>}
      </div>
      {activities.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginTop: 14 }}>
          {activities.map(a => (
            <div key={a.id} className="panel" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div><div className="muted" style={{ fontSize: 12 }}>{new Date(a.start_date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</div></div>
              <div className="num" style={{ textAlign: 'right', fontSize: 13 }}>
                {Number(a.distance).toFixed(1)} km<div className="muted" style={{ fontSize: 11.5 }}>{Math.floor(a.moving_time / 60)} min{a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
