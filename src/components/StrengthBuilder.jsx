import { useState } from 'react'
import { supabase } from '../supabase'
import { Overlay, FG } from './ui'

const EXERCISE_CATEGORIES = [
  'Propulsion', 'Gainage', 'Fessiers', 'Ischio-jambiers', 'Quadriceps',
  'Mollets', 'Éducatifs course', 'PPG', 'Mobilité', 'Récupération active'
]

export function ExerciseLibrary({ exercises, onAdd, onEdit, onDelete, showToast }) {
  const [modal, setModal] = useState(false)
  const [editEx, setEditEx] = useState(null)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800 }}>Bibliothèque d'exercices</div>
        <button className="btn-primary" onClick={() => { setEditEx(null); setModal(true) }}>+ Exercice</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {exercises.map(ex => (
          <div key={ex.id} className="card" style={{ borderLeft: '3px solid #f97316' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                <div style={{ fontSize: 11, color: '#f97316' }}>{ex.category}</div>
              </div>
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setEditEx(ex); setModal(true) }}>Éditer</button>
            </div>
            {ex.description && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{ex.description}</div>}
            {ex.video_url && (
              <a href={ex.video_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: 4 }}>
                ▶ Voir la vidéo
              </a>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
              {ex.sets && `${ex.sets} séries`}{ex.reps && ` × ${ex.reps} reps`}{ex.duration && ` · ${ex.duration}s`}
            </div>
          </div>
        ))}
        {exercises.length === 0 && <div style={{ color: '#475569', fontSize: 14, gridColumn: '1/-1', textAlign: 'center', padding: 32 }}>Aucun exercice. Crée ta bibliothèque !</div>}
      </div>
      {modal && <ModalExercise editEx={editEx} setModal={setModal} onSaved={onAdd} showToast={showToast} />}
    </div>
  )
}

function ModalExercise({ editEx, setModal, onSaved, showToast }) {
  const isEdit = !!editEx
  const [form, setForm] = useState(isEdit ? { ...editEx } : { name: '', category: 'PPG', description: '', video_url: '', sets: '', reps: '', duration: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.name.trim()) return showToast('Nom requis', 'err')
    setSaving(true)
    if (isEdit) await supabase.from('exercises').update(form).eq('id', editEx.id)
    else await supabase.from('exercises').insert(form)
    setSaving(false); setModal(false); onSaved(); showToast(isEdit ? 'Mis à jour ✓' : 'Exercice créé ✓')
  }

  // Extract YouTube video ID for preview
  const getYouTubeId = (url) => {
    if (!url) return null
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
    return match ? match[1] : null
  }
  const ytId = getYouTubeId(form.video_url)

  return (
    <Overlay onClose={() => setModal(false)}>
      <div className="modal-title">{isEdit ? 'Modifier l\'exercice' : 'Nouvel exercice'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FG label="NOM"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Montées de genoux, Squats sautés…" /></FG>
        <FG label="CATÉGORIE">
          <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {EXERCISE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FG>
        <FG label="DESCRIPTION"><textarea className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Description du mouvement, points clés…" /></FG>
        <FG label="LIEN VIDÉO (YouTube ou Instagram)"><input className="input" value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://youtube.com/watch?v=…" /></FG>
        {ytId && (
          <div style={{ borderRadius: 8, overflow: 'hidden', background: '#0a0f1a' }}>
            <iframe width="100%" height="180" src={`https://www.youtube.com/embed/${ytId}`} frameBorder="0" allowFullScreen title="preview" />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <FG label="SÉRIES"><input className="input" type="number" value={form.sets} onChange={e => setForm(f => ({ ...f, sets: e.target.value }))} placeholder="3" /></FG>
          <FG label="REPS"><input className="input" type="number" value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))} placeholder="12" /></FG>
          <FG label="DURÉE (sec)"><input className="input" type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="30" /></FG>
        </div>
        <FG label="NOTES"><textarea className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></FG>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={() => setModal(false)}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : isEdit ? 'Mettre à jour' : 'Créer'}</button>
        </div>
      </div>
    </Overlay>
  )
}

export function StrengthSessionBuilder({ draft, setDraft, exercises }) {
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.category.toLowerCase().includes(search.toLowerCase())
  )

  const addExercise = (ex) => {
    setDraft(d => ({ ...d, exercises: [...(d.exercises || []), { ...ex, exerciseId: ex.id, sets: ex.sets || 3, reps: ex.reps || '', duration: ex.duration || '', rest: 60 }] }))
    setAdding(false)
    setSearch('')
  }

  const removeEx = (idx) => setDraft(d => ({ ...d, exercises: d.exercises.filter((_, i) => i !== idx) }))
  const updateEx = (idx, field, val) => setDraft(d => {
    const exs = [...d.exercises]
    exs[idx] = { ...exs[idx], [field]: val }
    return { ...d, exercises: exs }
  })

  return (
    <div>
      <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em', marginBottom: 10 }}>EXERCICES DE LA SÉANCE</div>
      {(draft.exercises || []).map((ex, i) => (
        <div key={i} style={{ background: '#0a0f1a', borderRadius: 8, padding: 10, marginBottom: 8, borderLeft: '3px solid #f97316' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.name}</div>
            <button style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }} onClick={() => removeEx(i)}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
            <div><div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>SÉRIES</div><input className="input" type="number" value={ex.sets} onChange={e => updateEx(i, 'sets', e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} /></div>
            <div><div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>REPS</div><input className="input" type="number" value={ex.reps} onChange={e => updateEx(i, 'reps', e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} /></div>
            <div><div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>DURÉE(s)</div><input className="input" type="number" value={ex.duration} onChange={e => updateEx(i, 'duration', e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} /></div>
            <div><div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>RÉCUP(s)</div><input className="input" type="number" value={ex.rest} onChange={e => updateEx(i, 'rest', e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }} /></div>
          </div>
        </div>
      ))}
      {adding ? (
        <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, border: '1px solid #1e293b' }}>
          <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un exercice…" style={{ marginBottom: 10 }} autoFocus />
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(ex => (
              <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#111827', borderRadius: 6, cursor: 'pointer' }}
                onClick={() => addExercise(ex)}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{ex.name}</div>
                  <div style={{ fontSize: 11, color: '#f97316' }}>{ex.category}</div>
                </div>
                <span style={{ color: '#4ade80', fontSize: 18 }}>+</span>
              </div>
            ))}
            {filtered.length === 0 && <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 }}>Aucun exercice trouvé</div>}
          </div>
          <button className="btn-ghost" style={{ fontSize: 12, marginTop: 10, width: '100%' }} onClick={() => setAdding(false)}>Annuler</button>
        </div>
      ) : (
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setAdding(true)}>+ Ajouter un exercice</button>
      )}
    </div>
  )
}

// Athlete view of strength session
export function StrengthSessionView({ session }) {
  const [completedExs, setCompletedExs] = useState({})
  const exercises = session?.exercises || []

  const toggleDone = (i) => setCompletedExs(p => ({ ...p, [i]: !p[i] }))
  const doneCount = Object.values(completedExs).filter(Boolean).length

  return (
    <div>
      {doneCount > 0 && (
        <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12, color: '#4ade80' }}>
          {doneCount}/{exercises.length} exercices complétés
        </div>
      )}
      {exercises.map((ex, i) => {
        const ytId = ex.video_url ? ex.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1] : null
        const done = completedExs[i]
        return (
          <div key={i} style={{ background: '#0a0f1a', borderRadius: 10, padding: 14, marginBottom: 10, borderLeft: `3px solid ${done ? '#4ade80' : '#f97316'}`, opacity: done ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, textDecoration: done ? 'line-through' : 'none' }}>{ex.name}</div>
                <div style={{ fontSize: 11, color: '#f97316' }}>{ex.category}</div>
              </div>
              <button onClick={() => toggleDone(i)} style={{ background: done ? '#4ade8022' : '#1e293b', border: `1px solid ${done ? '#4ade80' : '#334155'}`, color: done ? '#4ade80' : '#64748b', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 11, fontFamily: "'DM Mono'" }}>
                {done ? '✓ Fait' : 'Valider'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: ex.description ? 8 : 0 }}>
              {ex.sets && <span><b style={{ color: '#e2e8f0' }}>{ex.sets}</b> <span style={{ color: '#64748b' }}>séries</span></span>}
              {ex.reps && <span><b style={{ color: '#e2e8f0' }}>{ex.reps}</b> <span style={{ color: '#64748b' }}>reps</span></span>}
              {ex.duration && <span><b style={{ color: '#e2e8f0' }}>{ex.duration}s</b> <span style={{ color: '#64748b' }}>durée</span></span>}
              {ex.rest && <span><b style={{ color: '#64748b' }}>{ex.rest}s</b> <span style={{ color: '#475569' }}>récup</span></span>}
            </div>
            {ex.description && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, lineHeight: 1.5 }}>{ex.description}</div>}
            {ytId && (
              <div style={{ borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
                <iframe width="100%" height="200" src={`https://www.youtube.com/embed/${ytId}`} frameBorder="0" allowFullScreen title={ex.name} />
              </div>
            )}
            {ex.video_url && !ytId && (
              <a href={ex.video_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#22d3ee', display: 'block', marginTop: 6 }}>▶ Voir la vidéo démo</a>
            )}
          </div>
        )
      })}
    </div>
  )
}
