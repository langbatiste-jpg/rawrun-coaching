import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { formatTime } from '../utils'
import { RPE_LABELS, RPE_COLORS } from '../constants'
import { sendEmail, emailNewMessage } from '../utils/resend'

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
    if (!text.trim()) return
    const msg = { session_key: sessionKey, athlete_id: athleteId, from_role: isCoach ? 'coach' : 'athlete', text: text.trim() }
    await supabase.from('messages').insert(msg)

    // Send email notification
    if (isCoach && athleteEmail) {
      const { subject, html } = emailNewMessage('Ton coach', sessionName, text.trim())
      await sendEmail({ to: athleteEmail, subject, html })
    } else if (!isCoach) {
      const { subject, html } = emailNewMessage(athleteName, sessionName, text.trim())
      await sendEmail({ to: 'langbat57@gmail.com', subject, html })
      // Add notification
      await supabase.from('notifications').insert({ athlete_id: athleteId, session_key: sessionKey, session_name: sessionName, type: 'message', title: `Nouveau message de ${athleteName}`, read: false })
    }
    setText('')
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', height: '75vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800 }}>{sessionName}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{athleteName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 22 }}>×</button>
        </div>

        {completion && (
          <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, flexShrink: 0 }}>
            <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: 6 }}>✅ Séance réalisée</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ color: RPE_COLORS[completion.rpe] }}>RPE {completion.rpe}/10 — {RPE_LABELS[completion.rpe]}</span>
              {completion.real_km && <span style={{ color: '#94a3b8' }}>{completion.real_km} km</span>}
              {completion.real_pace && <span style={{ color: '#94a3b8' }}>{completion.real_pace} /km moy.</span>}
            </div>
            {completion.sensations && <div style={{ color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>"{completion.sensations}"</div>}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {loading && <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', margin: 'auto' }}>Chargement…</div>}
          {!loading && messages.length === 0 && <div style={{ color: '#334155', fontSize: 13, textAlign: 'center', margin: 'auto' }}>Aucun message.</div>}
          {messages.map(m => {
            const mine = isCoach ? m.from_role === 'coach' : m.from_role === 'athlete'
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: m.from_role === 'coach' ? '#e11d4822' : '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: m.from_role === 'coach' ? '#e11d48' : '#64748b', flexShrink: 0 }}>
                  {m.from_role === 'coach' ? 'CO' : athleteName?.slice(0, 2).toUpperCase() || 'AT'}
                </div>
                <div style={{ maxWidth: '75%' }}>
                  <div className={mine ? 'bubble-coach' : 'bubble-athlete'} style={{ padding: '10px 13px', fontSize: 13, color: '#e2e8f0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.text}</div>
                  <div style={{ fontSize: 10, color: '#334155', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{formatTime(new Date(m.created_at).getTime())}</div>
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
          <button className="btn-primary" onClick={send} style={{ padding: '10px 16px' }}>→</button>
        </div>
      </div>
    </div>
  )
}
