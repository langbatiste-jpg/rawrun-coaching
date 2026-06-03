import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const QUESTIONS = [
  { key: 'form', label: 'Forme générale', emoji: '💪', low: 'Mauvaise', high: 'Excellente' },
  { key: 'fatigue', label: 'Fatigue', emoji: '😴', low: 'Épuisé', high: 'Frais', invert: true },
  { key: 'moral', label: 'Moral / Motivation', emoji: '🧠', low: 'Pas motivé', high: 'Super motivé' },
  { key: 'sleep', label: 'Qualité du sommeil', emoji: '🌙', low: 'Mauvais', high: 'Excellent' },
  { key: 'soreness', label: 'Douleurs musculaires', emoji: '🦵', low: 'Très courbaturé', high: 'Aucune douleur', invert: true },
]

export function WellnessCheckIn({ athleteId, onDone }) {
  const [scores, setScores] = useState({ form: 5, fatigue: 5, moral: 5, sleep: 5, soreness: 5 })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    checkToday()
  }, [])

  const checkToday = async () => {
    const { data } = await supabase.from('wellness').select('id').eq('athlete_id', athleteId).eq('date', today).single()
    if (data) setAlreadyDone(true)
  }

  const save = async () => {
    setSaving(true)
    await supabase.from('wellness').upsert({ athlete_id: athleteId, date: today, ...scores, notes }, { onConflict: 'athlete_id,date' })
    setSaving(false)
    if (onDone) onDone()
  }

  if (alreadyDone) return null

  return (
    <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Comment tu vas aujourd'hui ?</div>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>Quelques secondes pour que ton coach suive ton état.</div>
      {QUESTIONS.map(q => (
        <div key={q.key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 13 }}>{q.emoji} {q.label}</div>
            <div style={{ fontSize: 12, color: '#e11d48', fontWeight: 600 }}>{scores[q.key]}/10</div>
          </div>
          <input type="range" min={1} max={10} value={scores[q.key]}
            onChange={e => setScores(s => ({ ...s, [q.key]: Number(e.target.value) }))}
            style={{ width: '100%', accentColor: '#e11d48' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569' }}>
            <span>{q.low}</span><span>{q.high}</span>
          </div>
        </div>
      ))}
      <div style={{ marginBottom: 12 }}>
        <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Quelque chose à signaler à ton coach ? (douleur, stress, maladie…)" />
      </div>
      <button className="btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>{saving ? 'Envoi…' : 'Envoyer mon état du jour'}</button>
    </div>
  )
}

export function WellnessChart({ athleteId, days = 14 }) {
  const [data, setData] = useState([])

  useEffect(() => { loadData() }, [athleteId])

  const loadData = async () => {
    const from = new Date(); from.setDate(from.getDate() - days)
    const { data } = await supabase.from('wellness').select('*').eq('athlete_id', athleteId).gte('date', from.toISOString().slice(0, 10)).order('date')
    setData(data || [])
  }

  if (data.length === 0) return <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: 16 }}>Pas encore de données bien-être.</div>

  const avg = (key) => data.length ? (data.reduce((s, d) => s + (d[key] || 0), 0) / data.length).toFixed(1) : 0

  return (
    <div style={{ background: '#0a0f1a', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.06em', marginBottom: 12 }}>BIEN-ÊTRE — {days} DERNIERS JOURS</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {QUESTIONS.map(q => (
          <div key={q.key} style={{ background: '#111827', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{q.emoji}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e11d48', fontFamily: "'Syne'" }}>{avg(q.key)}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>{q.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 60 }}>
        {data.map((d, i) => {
          const score = (d.form + (10 - d.fatigue) + d.moral + d.sleep + (10 - d.soreness)) / 5
          const h = Math.round((score / 10) * 56)
          const color = score >= 7 ? '#4ade80' : score >= 5 ? '#fde047' : '#f43f5e'
          return (
            <div key={i} style={{ flex: 1, height: h, background: color, borderRadius: 2, opacity: 0.8 }} title={`${d.date}: ${score.toFixed(1)}/10`} />
          )
        })}
      </div>
      <div style={{ fontSize: 10, color: '#334155', textAlign: 'center', marginTop: 4 }}>Score global quotidien</div>
    </div>
  )
}
