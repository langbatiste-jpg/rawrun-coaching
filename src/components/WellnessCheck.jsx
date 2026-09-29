import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const QUESTIONS = [
  { key: 'form', label: 'Forme générale', emoji: '💪', low: 'Mauvaise', high: 'Excellente' },
  { key: 'fatigue', label: 'Fatigue', emoji: '😴', low: 'Épuisé', high: 'Frais', invert: true },
  { key: 'moral', label: 'Moral / Motivation', emoji: '🧠', low: 'Pas motivé', high: 'Super motivé' },
  { key: 'sleep', label: 'Qualité du sommeil', emoji: '🌙', low: 'Mauvais', high: 'Excellent' },
  { key: 'soreness', label: 'Douleurs musculaires', emoji: '🦵', low: 'Très courbaturé', high: 'Aucune douleur', invert: true },
]

export function WellnessCheckIn({ athleteId, onDone, compact = false }) {
  const [open, setOpen] = useState(!compact)
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
    setAlreadyDone(true)
    if (onDone) onDone()
  }

  if (alreadyDone) return null
  if (!open) return (
    <button className="card card-hover" onClick={() => setOpen(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text)', textAlign: 'left', marginBottom: 16 }}>
      <span style={{ fontSize: 22 }}>🫀</span>
      <span style={{ flex: 1 }}><b>Check-in du jour</b><br /><span className="muted" style={{ fontSize: 13 }}>Forme, fatigue, sommeil : 10 secondes</span></span>
      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Faire</span>
    </button>
  )

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="display" style={{ fontSize: 28, marginBottom: 2 }}>Comment tu te sens ?</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>Dix secondes pour que ton coach adapte la suite.</div>
      {QUESTIONS.map(q => (
        <div key={q.key} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 14 }}>{q.emoji} {q.label}</div>
            <div className="num" style={{ fontSize: 13, color: scoreColor(scores[q.key]) }}>{scores[q.key]}/10</div>
          </div>
          <input type="range" min={1} max={10} value={scores[q.key]} aria-label={q.label}
            onChange={e => setScores(s => ({ ...s, [q.key]: Number(e.target.value) }))}
            style={{ width: '100%', accentColor: scoreColor(scores[q.key]) }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-4)' }}>
            <span>{q.low}</span><span>{q.high}</span>
          </div>
        </div>
      ))}
      <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ marginBottom: 12 }} placeholder="Quelque chose à signaler ? (douleur, stress, maladie…)" />
      <button className="btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>{saving ? 'Envoi…' : 'Envoyer'}</button>
    </div>
  )
}

const scoreColor = v => v >= 7 ? '#c8ff2e' : v >= 5 ? '#fbbf24' : '#ff3b5c'

export function WellnessChart({ athleteId, days = 14 }) {
  const [data, setData] = useState([])

  useEffect(() => { loadData() }, [athleteId])

  const loadData = async () => {
    const from = new Date(); from.setDate(from.getDate() - days)
    const { data } = await supabase.from('wellness').select('*').eq('athlete_id', athleteId).gte('date', from.toISOString().slice(0, 10)).order('date')
    setData(data || [])
  }

  if (data.length === 0) return <div className="card muted" style={{ fontSize: 13 }}>Pas encore de check-in bien-être sur les {days} derniers jours.</div>

  const avg = key => (data.reduce((s, d) => s + (d[key] || 0), 0) / data.length).toFixed(1)

  return (
    <div className="card">
      <b>Bien-être</b><div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Moyennes sur {days} jours (10 = au top)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, marginBottom: 14 }}>
        {QUESTIONS.map(q => (
          <div key={q.key} className="panel" style={{ textAlign: 'center', padding: 10 }}>
            <div className="num" style={{ fontSize: 20, color: scoreColor(Number(avg(q.key))) }}>{avg(q.key)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{q.emoji} {q.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60 }}>
        {data.map((d, i) => {
          const score = (d.form + d.fatigue + d.moral + d.sleep + d.soreness) / 5
          return <div key={i} style={{ flex: 1, height: `${score * 10}%`, background: scoreColor(score), borderRadius: 2, opacity: .85 }} title={`${d.date} : ${score.toFixed(1)}/10${d.notes ? ' — ' + d.notes : ''}`} />
        })}
      </div>
    </div>
  )
}
