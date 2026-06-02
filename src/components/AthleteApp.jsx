import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { calculateZonesFromRecords, calculateZones, getWeekKey, generateTCX, downloadTCX, daysUntil, getStravaAuthUrl } from '../utils'
import { SESSION_TYPES, DAYS, BASE_ZONES, RPE_LABELS, RPE_COLORS } from '../constants'
import { Overlay, FG, WeekNav, ZoneBadge } from './ui'
import ChatModal from './ChatModal'
import MonthCalendar from './MonthCalendar'
import SessionBuilder from './SessionBuilder'

export default function AthleteApp({ athlete, onLogout, showToast }) {
  const [view, setView] = useState('week')
  const [calMode, setCalMode] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekSlots, setWeekSlots] = useState([])
  const [sessions, setSessions] = useState([])
  const [completions, setCompletions] = useState({})
  const [raceGoals, setRaceGoals] = useState([])
  const [stravaActivities, setStravaActivities] = useState([])
  const [modal, setModal] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [chatTarget, setChatTarget] = useState(null)
  const weekKey = getWeekKey(weekOffset)
  const zones = athlete?.records?.length ? calculateZonesFromRecords(athlete.records) : (athlete?.perf_5k ? calculateZones(athlete.perf_5k, 5) : BASE_ZONES.map(z => ({ ...z, paceMin: '—', paceMax: '—' })))

  useEffect(() => { loadAll() }, [weekKey])

  // Strava callback handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (code && state === athlete?.id) {
      handleStravaCallback(code)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    const ch = supabase.channel(`athlete_${athlete?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_slots', filter: `athlete_id=eq.${athlete?.id}` }, loadWeek)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {})
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const loadAll = async () => {
    await Promise.all([loadWeek(), loadSessions(), loadCompletions(), loadRaceGoals(), loadStravaActivities()])
  }
  const loadWeek = async () => {
    const { data } = await supabase.from('week_slots').select('*').eq('athlete_id', athlete.id).eq('week_key', weekKey).order('day_index')
    const arr = Array(7).fill(null)
    data?.forEach(s => { arr[s.day_index] = s })
    setWeekSlots(arr)
  }
  const loadSessions = async () => { const { data } = await supabase.from('sessions').select('*'); setSessions(data || []) }
  const loadCompletions = async () => { const { data } = await supabase.from('completions').select('*').eq('athlete_id', athlete.id); const map = {}; data?.forEach(c => { map[c.session_key] = c }); setCompletions(map) }
  const loadRaceGoals = async () => { const { data } = await supabase.from('race_goals').select('*').eq('athlete_id', athlete.id).order('date'); setRaceGoals(data || []) }
  const loadStravaActivities = async () => { const { data } = await supabase.from('strava_activities').select('*').eq('athlete_id', athlete.id).order('start_date', { ascending: false }).limit(10); setStravaActivities(data || []) }

  const handleStravaCallback = async (code) => {
    // Exchange code for token via Supabase edge function or direct API
    showToast('Connexion Strava en cours…')
    try {
      const res = await fetch(`https://www.strava.com/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: '254589', client_secret: '03fc195b76a04f706f11aae67983ddebd9f8d5aa', code, grant_type: 'authorization_code' })
      })
      const data = await res.json()
      if (data.access_token) {
        await supabase.from('strava_tokens').upsert({ athlete_id: athlete.id, strava_athlete_id: data.athlete?.id, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at })
        await supabase.from('athlete_accounts').update({ strava_connected: true }).eq('athlete_id', athlete.id)
        showToast('Strava connecté ✓')
        importStravaActivities(data.access_token)
      }
    } catch (e) { showToast('Erreur Strava', 'err') }
  }

  const importStravaActivities = async (token) => {
    try {
      const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=20`, { headers: { Authorization: `Bearer ${token}` } })
      const activities = await res.json()
      if (Array.isArray(activities)) {
        const toInsert = activities.filter(a => a.sport_type === 'Run' || a.type === 'Run').map(a => ({
          athlete_id: athlete.id, strava_id: a.id, name: a.name,
          distance: a.distance / 1000, moving_time: a.moving_time,
          average_speed: a.average_speed, average_heartrate: a.average_heartrate,
          max_heartrate: a.max_heartrate, start_date: a.start_date, raw: a
        }))
        if (toInsert.length > 0) await supabase.from('strava_activities').upsert(toInsert, { onConflict: 'strava_id' })
        loadStravaActivities()
        showToast(`${toInsert.length} activités importées ✓`)
      }
    } catch (e) { console.error(e) }
  }

  const openChat = (sessionKey, sessionName) => setChatTarget({ athleteId: athlete.id, sessionKey, sessionName, athleteName: athlete.name })

  const getSlotForMonth = (aId, wk, dayIdx) => {
    // For month view, we need to fetch slots differently
    return null // Simplified for now
  }

  const totalKm = weekSlots.reduce((s, d) => s + (d?.km || 0), 0)
  const doneCount = weekSlots.filter((_, i) => !!completions[`${athlete.id}__${weekKey}__${i}`]).length
  const nextRace = raceGoals.filter(g => daysUntil(g.date) >= 0).sort((a, b) => new Date(a.date) - new Date(b.date))[0]

  return (
    <div>
      <nav className="rr-nav">
        <div className="rr-nav-logo">RAW<span>RUN</span></div>
        <div className="rr-nav-spacer" />
        {[['week', 'Ma semaine'], ['zones', 'Mes zones'], ['goals', 'Objectifs'], ['strava', 'Strava']].map(([v, l]) => (
          <button key={v} className={`rr-nav-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{l}</button>
        ))}
        <button className="btn-ghost" style={{ fontSize: 12, marginLeft: 8 }} onClick={onLogout}>← Déco</button>
      </nav>

      <div className="rr-content">
        {/* Header */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>{athlete.name.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800 }}>{athlete.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{athlete.goal || 'En préparation'}</div>
          </div>
          {nextRace && (
            <div style={{ textAlign: 'right', background: '#111827', border: '1px solid #1e293b', borderRadius: 10, padding: '8px 14px' }}>
              <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.06em' }}>PROCHAIN OBJECTIF</div>
              <div style={{ fontFamily: "'Syne'", fontSize: 16, fontWeight: 800, color: nextRace.goal_type === 'primary' ? '#fbbf24' : '#94a3b8' }}>J−{daysUntil(nextRace.date)}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{nextRace.name}</div>
            </div>
          )}
        </div>

        {view === 'week' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Semaine {weekKey}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{totalKm > 0 ? `${totalKm} km planifiés` : ''} {doneCount > 0 ? `· ${doneCount} réalisées` : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 2, background: '#0a0f1a', borderRadius: 6, padding: 3 }}>
                  {[['week', 'Sem.'], ['month', 'Mois']].map(([m, l]) => (
                    <button key={m} onClick={() => setCalMode(m)} style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 11, background: calMode === m ? '#1e293b' : 'transparent', color: calMode === m ? '#fff' : '#64748b' }}>{l}</button>
                  ))}
                </div>
                {calMode === 'week' && <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />}
              </div>
            </div>

            {calMode === 'week' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {DAYS.map((day, i) => {
                  const slot = weekSlots[i]
                  const st = slot?.session_type ? SESSION_TYPES.find(t => t.id === slot.session_type) : null
                  const sess = slot?.session_id ? sessions.find(s => s.id === slot.session_id) : null
                  const isRest = !slot || slot.session_type === 'REPOS'
                  const compKey = `${athlete.id}__${weekKey}__${i}`
                  const comp = completions[compKey]
                  return (
                    <div key={i} className="card" style={{ borderLeft: `3px solid ${comp ? '#4ade80' : isRest ? '#1e293b' : st?.color || '#334155'}`, opacity: isRest ? 0.4 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
                          <div style={{ fontSize: 12, color: '#64748b', width: 28, flexShrink: 0 }}>{day}</div>
                          {isRest ? <span style={{ fontSize: 13, color: '#475569' }}>Repos</span> : (
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{sess?.name || st?.label || 'Séance'}</div>
                              <div style={{ fontSize: 12, color: st?.color }}>{st?.label}{slot?.km > 0 ? ` · ${slot.km} km` : ''}</div>
                              {comp && <div style={{ fontSize: 11, color: '#4ade80', marginTop: 2 }}>✓ Réalisée · RPE {comp.rpe}/10</div>}
                              {slot?.note && <div style={{ fontSize: 11, color: '#fde047', marginTop: 2 }}>📌 {slot.note}</div>}
                            </div>
                          )}
                        </div>
                        {!isRest && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            {comp ? (
                              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => openChat(compKey, sess?.name || st?.label || day)}>💬 Chat</button>
                            ) : (
                              <button className="btn-primary" style={{ fontSize: 11, padding: '7px 12px' }}
                                onClick={() => { setSelectedSlot({ slot, sess, zones, dayIndex: i, compKey, chatKey: compKey }); setModal('complete') }}>
                                Voir + Valider
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {calMode === 'month' && (
              <MonthCalendar
                athleteId={athlete.id}
                getSlot={getSlotForMonth}
                sessions={sessions}
                completions={completions}
                raceGoals={raceGoals}
                onSlotClick={() => {}}
              />
            )}
          </>
        )}

        {view === 'zones' && (
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Mes zones d'allure</div>
            {athlete.records?.length > 0 && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Calculées depuis {athlete.records.length} record{athlete.records.length > 1 ? 's' : ''}</div>}
            {athlete.perf_5k && !athlete.records?.length && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Calculées sur ton 5km en {athlete.perf_5k}</div>}
            {!athlete.perf_5k && !athlete.records?.length && <div style={{ fontSize: 13, color: '#e11d48', marginBottom: 16 }}>Aucune perf renseignée. Contacte ton coach.</div>}
            {athlete.records?.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {athlete.records.map((r, i) => <span key={i} className="tag">{r.distance} : {r.time}</span>)}
              </div>
            )}
            {zones.map(z => <div key={z.id} style={{ marginBottom: 6 }}><ZoneBadge zone={z} paceMin={z.paceMin} paceMax={z.paceMax} /></div>)}
          </div>
        )}

        {view === 'goals' && (
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Mes objectifs</div>
            {raceGoals.length === 0 && <div style={{ color: '#475569', textAlign: 'center', padding: 48 }}>Aucun objectif défini par ton coach.</div>}
            {raceGoals.map(g => {
              const days = daysUntil(g.date)
              const isPast = days < 0
              return (
                <div key={g.id} className="card" style={{ marginBottom: 12, borderLeft: `3px solid ${g.goal_type === 'primary' ? '#fbbf24' : '#64748b'}`, opacity: isPast ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: "'Syne'", fontSize: 18, fontWeight: 800 }}>{g.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{g.location} · {g.distance} · {new Date(g.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                      {g.target_time && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>🎯 Objectif : {g.target_time}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Syne'", fontSize: 32, fontWeight: 800, color: isPast ? '#475569' : g.goal_type === 'primary' ? '#fbbf24' : '#94a3b8', lineHeight: 1 }}>
                        {isPast ? '✓' : `J−${days}`}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{g.goal_type === 'primary' ? '🎯 Principal' : '📌 Secondaire'}</div>
                    </div>
                  </div>
                  {g.coach_notes && (
                    <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 13, color: '#94a3b8', lineHeight: 1.6, borderLeft: '3px solid #1e293b' }}>
                      💬 {g.coach_notes}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {view === 'strava' && (
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 20 }}>Strava</div>
            <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid #fc4c02' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: 32 }}>🏃</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Connecte ton compte Strava</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Importe automatiquement tes activités pour que ton coach puisse analyser tes performances.</div>
                </div>
                <a href={getStravaAuthUrl(athlete.id)} style={{ background: '#fc4c02', color: '#fff', textDecoration: 'none', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontFamily: "'DM Mono'", fontWeight: 500, flexShrink: 0 }}>
                  Connecter Strava
                </a>
              </div>
            </div>
            {stravaActivities.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em', marginBottom: 12 }}>ACTIVITÉS RÉCENTES</div>
                {stravaActivities.map(a => (
                  <div key={a.id} className="card" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{new Date(a.start_date).toLocaleDateString('fr-FR')}</div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12 }}>
                        <div style={{ color: '#e2e8f0' }}>{a.distance?.toFixed(1)} km</div>
                        <div style={{ color: '#64748b' }}>{Math.floor(a.moving_time / 60)} min</div>
                        {a.average_heartrate && <div style={{ color: '#f43f5e' }}>♥ {Math.round(a.average_heartrate)} bpm</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal === 'complete' && selectedSlot && (
        <ModalComplete selectedSlot={selectedSlot} athlete={athlete} setModal={setModal} setSelectedSlot={setSelectedSlot}
          onDone={() => { loadCompletions(); setModal(null) }} openChat={openChat} showToast={showToast} />
      )}
      {chatTarget && <ChatModal {...chatTarget} isCoach={false} completion={completions[chatTarget.sessionKey]} onClose={() => setChatTarget(null)} />}
    </div>
  )
}

function ModalComplete({ selectedSlot, athlete, setModal, setSelectedSlot, onDone, openChat, showToast }) {
  const { slot, sess, zones, dayIndex, compKey, chatKey } = selectedSlot
  const st = SESSION_TYPES.find(t => t.id === slot?.session_type)
  const [step, setStep] = useState('detail')
  const [rpe, setRpe] = useState(5)
  const [sensations, setSensations] = useState('')
  const [realKm, setRealKm] = useState(slot?.km || '')
  const [realPace, setRealPace] = useState('')
  const [garminNote, setGarminNote] = useState('')
  const [saving, setSaving] = useState(false)

  const validate = async () => {
    setSaving(true)
    await supabase.from('completions').upsert({ session_key: compKey, athlete_id: athlete.id, rpe, sensations, real_km: Number(realKm) || null, real_pace: realPace, garmin_note: garminNote }, { onConflict: 'session_key' })
    const firstText = `✅ Séance terminée !\n\nRPE : ${rpe}/10 — ${RPE_LABELS[rpe]}\nDistance : ${realKm || '?'} km${realPace ? `\nAllure moy. : ${realPace} /km` : ''}${sensations ? `\n\nSensations : ${sensations}` : ''}${garminNote ? `\n\nGarmin : ${garminNote}` : ''}`
    await supabase.from('messages').insert({ session_key: chatKey, athlete_id: athlete.id, from_role: 'athlete', text: firstText })
    await supabase.from('notifications').insert({ athlete_id: athlete.id, session_key: chatKey, session_name: sess?.name || st?.label || 'Séance', type: 'completion', title: `${athlete.name} a validé sa séance — ${sess?.name || st?.label || 'Séance'}`, detail: `RPE ${rpe}/10 · ${sensations || 'Aucune sensation renseignée'}`, read: false })
    setSaving(false); setStep('done'); onDone(); showToast('Séance validée ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)}>
      <div style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        {step === 'detail' && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
              <div style={{ width: 4, height: 36, background: st?.color, borderRadius: 2 }} />
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800 }}>{sess?.name || st?.label || 'Séance'}</div>
                <div style={{ fontSize: 12, color: st?.color }}>{st?.label}{slot?.km > 0 ? ` · ${slot.km} km` : ''}</div>
              </div>
            </div>
            {slot?.note && <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 13, color: '#fde047', marginBottom: 14, borderLeft: '3px solid #fde04744', lineHeight: 1.5 }}>📌 {slot.note}</div>}
            {sess?.description && <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 13, color: '#94a3b8', marginBottom: 14, lineHeight: 1.6 }}>{sess.description}</div>}

            {/* Session structure with loops */}
            {sess?.blocks?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.06em', marginBottom: 10 }}>STRUCTURE DE LA SÉANCE</div>
                {sess.blocks.map((b, i) => {
                  if (b.isLoop) return (
                    <div key={i} style={{ border: '1px solid #e11d4833', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <div style={{ color: '#e11d48', fontWeight: 600, marginBottom: 8 }}>🔁 {b.loopReps}× Boucle</div>
                      {(b.loopBlocks || []).map((lb, li) => {
                        const z = zones[lb.zone - 1]
                        return (
                          <div key={li} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 10px', marginBottom: 5, background: '#0a0f1a', borderRadius: 6, borderLeft: `3px solid ${z?.color}` }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{lb.name || `Z${lb.zone}`}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{lb.durationType === 'time' ? `${lb.duration}${lb.timeUnit}` : `${lb.distance}${lb.distUnit}`}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: z?.color }}>{z?.paceMax} – {z?.paceMin}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                  const z = zones[b.zone - 1]
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', marginBottom: 6, background: '#0a0f1a', borderRadius: 8, borderLeft: `3px solid ${z?.color}` }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: z?.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: z?.color, fontWeight: 700 }}>Z{b.zone}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name || z?.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{b.durationType === 'time' ? `${b.duration}${b.timeUnit}` : `${b.distance}${b.distUnit}`} · {b.lapMode === 'lap' ? '⌨ LAP' : '▶ Auto'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: z?.color }}>{z?.paceMax} – {z?.paceMin}</div>
                        <div style={{ fontSize: 10, color: '#475569' }}>min/km</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
              <button className="btn-ghost" onClick={() => setModal(null)}>Fermer</button>
              <button className="btn-primary" onClick={() => setStep('feedback')}>J'ai fait la séance →</button>
            </div>
          </>
        )}

        {step === 'feedback' && (
          <>
            <div className="modal-title">Retour de séance</div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.06em', marginBottom: 10 }}>RPE — EFFORT RESSENTI (1 à 10)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} className={`rpe-btn ${rpe === n ? 'active' : ''}`} style={{ color: RPE_COLORS[n] }} onClick={() => setRpe(n)}>{n}</button>
                ))}
              </div>
              <div style={{ fontSize: 13, color: RPE_COLORS[rpe], fontWeight: 600 }}>{RPE_LABELS[rpe]}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <FG label="DISTANCE RÉELLE (km)"><input className="input" type="number" step="0.1" value={realKm} onChange={e => setRealKm(e.target.value)} placeholder="12.4" /></FG>
              <FG label="ALLURE MOYENNE (mm:ss)"><input className="input" value={realPace} onChange={e => setRealPace(e.target.value)} placeholder="4:32" /></FG>
            </div>
            <FG label="SENSATIONS"><textarea className="input" value={sensations} onChange={e => setSensations(e.target.value)} rows={3} placeholder="Jambes, souffle, mental, météo…" style={{ marginBottom: 14 }} /></FG>
            <FG label="DONNÉES GARMIN (optionnel)"><textarea className="input" value={garminNote} onChange={e => setGarminNote(e.target.value)} rows={2} placeholder="FC moy., puissance, V.O₂…" /></FG>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 18 }}>
              <button className="btn-ghost" onClick={() => setStep('detail')}>← Retour</button>
              <button className="btn-primary" onClick={validate} disabled={saving}>{saving ? 'Envoi…' : 'Valider →'}</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Séance validée !</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>Ton coach a été notifié. Tu peux lui envoyer un message.</div>
            <button className="btn-primary" onClick={() => { setModal(null); openChat(chatKey, sess?.name || st?.label || 'Séance') }}>Ouvrir le chat →</button>
          </div>
        )}
      </div>
    </Overlay>
  )
}
