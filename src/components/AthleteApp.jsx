import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { calculateZones, getWeekKey, generateTCX, downloadTCX } from '../utils'
import { SESSION_TYPES, DAYS, BASE_ZONES, RPE_LABELS, RPE_COLORS } from '../constants'
import { Overlay, FG, WeekNav, ZoneBadge } from './ui'
import ChatModal from './ChatModal'

export default function AthleteApp({ athlete, onLogout, showToast }) {
  const [view, setView] = useState('week')
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekSlots, setWeekSlots] = useState([])
  const [sessions, setSessions] = useState([])
  const [completions, setCompletions] = useState({})
  const [modal, setModal] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [chatTarget, setChatTarget] = useState(null)
  const weekKey = getWeekKey(weekOffset)
  const zones = athlete.perf_5k ? calculateZones(athlete.perf_5k, 5) : (athlete.perf_10k ? calculateZones(athlete.perf_10k, 10) : BASE_ZONES)

  useEffect(() => { loadWeek(); loadSessions(); loadCompletions() }, [weekKey])

  // Realtime: listen for new slot assignments
  useEffect(() => {
    const ch = supabase.channel('athlete_slots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'week_slots', filter: `athlete_id=eq.${athlete.id}` }, () => loadWeek())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  const loadWeek = async () => {
    const { data } = await supabase.from('week_slots').select('*').eq('athlete_id', athlete.id).eq('week_key', weekKey).order('day_index')
    const arr = Array(7).fill(null)
    data?.forEach(s => { arr[s.day_index] = s })
    setWeekSlots(arr)
  }
  const loadSessions = async () => {
    const { data } = await supabase.from('sessions').select('*')
    setSessions(data || [])
  }
  const loadCompletions = async () => {
    const { data } = await supabase.from('completions').select('*').eq('athlete_id', athlete.id)
    const map = {}
    data?.forEach(c => { map[c.session_key] = c })
    setCompletions(map)
  }

  const openChat = (sessionKey, sessionName) => {
    setChatTarget({ athleteId: athlete.id, sessionKey, sessionName, athleteName: athlete.name })
  }

  const totalKm = weekSlots.reduce((s, d) => s + (d?.km || 0), 0)
  const doneCount = weekSlots.filter((_, i) => !!completions[`${athlete.id}__${weekKey}__${i}`]).length

  return (
    <div>
      <nav className="rr-nav">
        <div className="rr-nav-logo">RAW<span>RUN</span></div>
        <div className="rr-nav-spacer" />
        {[['week', 'Ma semaine'], ['zones', 'Mes zones']].map(([v, l]) => (
          <button key={v} className={`rr-nav-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>{l}</button>
        ))}
        <button className="btn-ghost" style={{ fontSize: 12, marginLeft: 8 }} onClick={onLogout}>← Déco</button>
      </nav>

      <div className="rr-content">
        {/* Athlete header */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>{athlete.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800 }}>{athlete.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{athlete.goal || 'En préparation'}</div>
          </div>
        </div>

        {view === 'week' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Semaine {weekKey}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{totalKm > 0 ? `${totalKm} km planifiés` : ''} {doneCount > 0 ? `· ${doneCount} réalisées` : ''}</div>
              </div>
              <WeekNav weekKey={weekKey} offset={weekOffset} setOffset={setWeekOffset} />
            </div>

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
                        {isRest ? (
                          <span style={{ fontSize: 13, color: '#475569' }}>Repos</span>
                        ) : (
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
                            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => openChat(compKey, sess?.name || st?.label || day)}>
                              💬 Chat avec coach
                            </button>
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
          </>
        )}

        {view === 'zones' && (
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Mes zones d'allure</div>
            {athlete.perf_5k && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Calculées sur ton 5km en {athlete.perf_5k}</div>}
            {!athlete.perf_5k && !athlete.perf_10k && <div style={{ fontSize: 13, color: '#e11d48', marginBottom: 20 }}>Aucune perf renseignée. Contacte ton coach.</div>}
            {zones.map(z => <div key={z.id} style={{ marginBottom: 6 }}><ZoneBadge zone={z} paceMin={z.paceMin} paceMax={z.paceMax} /></div>)}
          </div>
        )}
      </div>

      {modal === 'complete' && selectedSlot && (
        <ModalComplete
          selectedSlot={selectedSlot}
          athlete={athlete}
          setModal={setModal}
          setSelectedSlot={setSelectedSlot}
          onDone={() => { loadCompletions(); setModal(null) }}
          openChat={openChat}
          showToast={showToast}
        />
      )}

      {chatTarget && (
        <ChatModal
          {...chatTarget}
          isCoach={false}
          completion={completions[chatTarget.sessionKey]}
          onClose={() => setChatTarget(null)}
        />
      )}
    </div>
  )
}

// ── Modal Complete Session ──
function ModalComplete({ selectedSlot, athlete, setModal, setSelectedSlot, onDone, openChat, showToast }) {
  const { slot, sess, zones, dayIndex, compKey, chatKey } = selectedSlot
  const st = SESSION_TYPES.find(t => t.id === slot?.session_type)
  const [step, setStep] = useState('detail') // detail | feedback | done
  const [rpe, setRpe] = useState(5)
  const [sensations, setSensations] = useState('')
  const [realKm, setRealKm] = useState(slot?.km || '')
  const [realPace, setRealPace] = useState('')
  const [garminNote, setGarminNote] = useState('')
  const [saving, setSaving] = useState(false)

  const validate = async () => {
    setSaving(true)
    // Save completion
    await supabase.from('completions').upsert({
      session_key: compKey,
      athlete_id: athlete.id,
      rpe, sensations, real_km: Number(realKm) || null, real_pace: realPace, garmin_note: garminNote
    }, { onConflict: 'session_key' })
    // Auto first message in chat
    const firstText = `✅ Séance terminée !\n\nRPE : ${rpe}/10 — ${RPE_LABELS[rpe]}\nDistance : ${realKm || '?'} km${realPace ? `\nAllure moy. : ${realPace} /km` : ''}${sensations ? `\n\nSensations : ${sensations}` : ''}${garminNote ? `\n\nGarmin : ${garminNote}` : ''}`
    await supabase.from('messages').insert({ session_key: chatKey, athlete_id: athlete.id, from_role: 'athlete', text: firstText })
    // Notification for coach
    await supabase.from('notifications').insert({
      athlete_id: athlete.id,
      session_key: chatKey,
      session_name: sess?.name || st?.label || 'Séance',
      type: 'completion',
      title: `${athlete.name} a validé sa séance — ${sess?.name || st?.label || 'Séance'}`,
      detail: `RPE ${rpe}/10 · ${sensations || 'Aucune sensation renseignée'}`,
      read: false
    })
    setSaving(false)
    setStep('done')
    onDone()
    showToast('Séance validée ✓')
  }

  return (
    <Overlay onClose={() => setModal(null)}>
      <div className="modal-scroll">
        {step === 'detail' && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
              <div style={{ width: 4, height: 36, background: st?.color, borderRadius: 2 }} />
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800 }}>{sess?.name || st?.label || 'Séance'}</div>
                <div style={{ fontSize: 12, color: st?.color }}>{st?.label}{slot?.km > 0 ? ` · ${slot.km} km planifiés` : ''}</div>
              </div>
            </div>
            {slot?.note && <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 13, color: '#fde047', marginBottom: 14, borderLeft: '3px solid #fde04744', lineHeight: 1.5 }}>📌 {slot.note}</div>}
            {sess?.description && <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, fontSize: 13, color: '#94a3b8', marginBottom: 14, lineHeight: 1.6 }}>{sess.description}</div>}
            {sess?.blocks?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.06em', marginBottom: 10 }}>STRUCTURE DE LA SÉANCE</div>
                {sess.blocks.map((b, i) => {
                  const z = zones[b.zone - 1]
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', marginBottom: 6, background: '#0a0f1a', borderRadius: 8, borderLeft: `3px solid ${z?.color}` }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: z?.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: z?.color, fontWeight: 700 }}>Z{b.zone}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{b.reps > 1 ? `${b.reps}× ` : ''}{b.name || z?.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{b.duration_type === 'time' ? `${Math.floor(b.duration / 60)} min` : `${b.distance}m`}</div>
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
            {sess?.blocks?.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 12, marginBottom: 16 }} onClick={() => {
                const steps = sess.blocks.map(b => { const z = zones[b.zone - 1]; return { name: b.name || `Z${b.zone}`, durationType: b.duration_type, duration: b.duration, distance: b.distance, paceMin: z?.paceMin, paceMax: z?.paceMax } })
                downloadTCX(generateTCX(sess.name, steps), sess.name.replace(/\s+/g, '_'))
              }}>⬇ Télécharger sur Garmin (.tcx)</button>
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
                  <button key={n} className={`rpe-btn ${rpe === n ? 'active' : ''}`}
                    style={{ color: RPE_COLORS[n] }}
                    onClick={() => setRpe(n)}>{n}</button>
                ))}
              </div>
              <div style={{ fontSize: 13, color: RPE_COLORS[rpe], fontWeight: 600 }}>{RPE_LABELS[rpe]}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <FG label="DISTANCE RÉELLE (km)"><input className="input" type="number" step="0.1" value={realKm} onChange={e => setRealKm(e.target.value)} placeholder="12.4" /></FG>
              <FG label="ALLURE MOYENNE (mm:ss)"><input className="input" value={realPace} onChange={e => setRealPace(e.target.value)} placeholder="4:32" /></FG>
            </div>
            <FG label="SENSATIONS / RESSENTI"><textarea className="input" value={sensations} onChange={e => setSensations(e.target.value)} rows={3} placeholder="Jambes, souffle, mental, météo, douleurs…" style={{ marginBottom: 14 }} /></FG>
            <FG label="DONNÉES GARMIN (optionnel)"><textarea className="input" value={garminNote} onChange={e => setGarminNote(e.target.value)} rows={2} placeholder="FC moy., puissance, commentaire Garmin…" /></FG>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 18 }}>
              <button className="btn-ghost" onClick={() => setStep('detail')}>← Retour</button>
              <button className="btn-primary" onClick={validate} disabled={saving}>{saving ? 'Envoi…' : 'Valider la séance →'}</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Séance validée !</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>Ton coach a été notifié. Tu peux lui envoyer un message.</div>
            <button className="btn-primary" onClick={() => { setModal(null); openChat(chatKey, sess?.name || st?.label || 'Séance') }}>
              Ouvrir le chat avec coach →
            </button>
          </div>
        )}
      </div>
    </Overlay>
  )
}
