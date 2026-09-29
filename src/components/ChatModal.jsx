import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { formatTime } from '../utils'
import { RPE_LABELS, RPE_COLORS } from '../constants'
import { api } from '../api'

export default function ChatModal({ sessionKey, sessionName, athleteId, athleteName, isCoach, completion, onClose, athleteEmail, coachEmail }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadMessages()
    const channel = supabase.channel(`chat_${sessionKey}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_key=eq.${sessionKey}` },
        payload => setMessages(prev => [...prev, payload.new]))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [sessionKey])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const loadMessages = async () => {
    const { data } = await supabase.from('messages').select('*').eq('session_key', sessionKey).order('created_at', { ascending: true })
    setMessages(data || [])
    setLoading(false)
  }

  const send = async () => {
    const t = text.trim()
    if (!t) return
    setText('')
    const msg = { session_key: sessionKey, athlete_id: athleteId, from_role: isCoach ? 'coach' : 'athlete', text: t }
    const { error } = await supabase.from('messages').insert(msg)
    if (error) { setText(t); return }
    if (!isCoach) await supabase.from('notifications').insert({ athlete_id: athleteId, session_key: sessionKey, session_name: sessionName, type: 'message', title: `Nouveau message de ${athleteName}`, detail: t.slice(0, 200), read: false })
    // e-mail envoyé par le serveur (les destinataires sont décidés côté serveur)
    api('notify', { type: 'message', athlete_id: athleteId, session_key: sessionKey, session_name: sessionName, text: t }, { coach: isCoach }).catch(() => {})
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', height: '78vh', maxHeight: '78dvh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 26 }}>{sessionName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{athleteName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        {completion && (
          <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, flexShrink: 0 }}>
            <div style={{ color: 'var(--lime)', fontWeight: 600, marginBottom: 6 }}>✅ Séance réalisée</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ color: RPE_COLORS[completion.rpe] }}>RPE {completion.rpe}/10 — {RPE_LABELS[completion.rpe]}</span>
              {completion.real_km && <span style={{ color: 'var(--text-2)' }}>{completion.real_km} km</span>}
              {completion.real_pace && <span style={{ color: 'var(--text-2)' }}>{completion.real_pace} /km moy.</span>}
            </div>
            {completion.sensations && <div style={{ color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>"{completion.sensations}"</div>}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {loading && <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', margin: 'auto' }}>Chargement…</div>}
          {!loading && messages.length === 0 && <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', margin: 'auto' }}>Aucun message.</div>}
          {messages.map(m => {
            const mine = isCoach ? m.from_role === 'coach' : m.from_role === 'athlete'
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: m.from_role === 'coach' ? '#ff5a1f22' : 'var(--bg-4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: m.from_role === 'coach' ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                  {m.from_role === 'coach' ? 'CO' : athleteName?.slice(0, 2).toUpperCase() || 'AT'}
                </div>
                <div style={{ maxWidth: '75%' }}>
                  <div className={`bubble ${m.from_role === 'coach' ? 'bubble-coach' : 'bubble-athlete'}`} style={{ maxWidth: 'none' }}>{m.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{formatTime(new Date(m.created_at).getTime())}</div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <input className="input" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={isCoach ? 'Retour coach…' : 'Message…'} style={{ flex: 1 }} />
          <button className="btn-primary" onClick={send} aria-label="Envoyer">Envoyer</button>
        </div>
      </div>
    </div>
  )
}
