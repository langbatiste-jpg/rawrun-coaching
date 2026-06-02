import { useState } from 'react'
import { BASE_ZONES } from '../constants'
import { secsToPace, parsePace } from '../utils'

const SESSION_TYPE_OPTIONS = [
  { id: 'EF', label: 'Endurance Fondamentale', color: '#6b7280' },
  { id: 'SEUIL', label: 'Seuil / Tempo', color: '#fde047' },
  { id: 'VMA', label: 'VMA / Intervalles', color: '#f43f5e' },
  { id: 'FARTLEK', label: 'Fartlek', color: '#a78bfa' },
  { id: 'COTES', label: 'Côtes / PPG', color: '#f97316' },
  { id: 'SORTIE', label: 'Sortie Longue', color: '#818cf8' },
  { id: 'PISTE', label: 'Piste', color: '#22d3ee' },
  { id: 'RECUP', label: 'Récupération Active', color: '#94a3b8' },
  { id: 'REPOS', label: 'Repos', color: '#1e293b' },
  { id: 'COMP', label: 'Compétition', color: '#fbbf24' },
  { id: 'CROSS', label: 'Cross / Trail', color: '#84cc16' },
  { id: 'RENFO', label: 'Renforcement', color: '#fb923c' },
]

const TIME_UNITS = ['sec', 'min', 'h']
const DIST_UNITS = ['m', 'km']

function toSeconds(val, unit) {
  if (unit === 'sec') return Number(val)
  if (unit === 'min') return Number(val) * 60
  if (unit === 'h') return Number(val) * 3600
  return Number(val)
}

function toMeters(val, unit) {
  if (unit === 'm') return Number(val)
  if (unit === 'km') return Number(val) * 1000
  return Number(val)
}

function calcBlockDistance(block, zones) {
  // Calculate estimated distance for a block based on zone pace
  if (block.durationType === 'distance') {
    return block.distUnit === 'km' ? block.distance : block.distance / 1000
  }
  const z = zones[block.zone - 1]
  if (!z || !z.paceMin || z.paceMin === '—') return 0
  const paceSecs = parsePace(z.paceMin) // min pace = slowest
  const secs = toSeconds(block.duration, block.timeUnit)
  return paceSecs > 0 ? (secs / paceSecs) : 0
}

export function calcTotalDistance(blocks, zones) {
  let total = 0
  blocks.forEach(b => {
    const reps = b.isLoop ? (b.loopReps || 1) : 1
    if (b.isLoop && b.loopBlocks) {
      const loopDist = b.loopBlocks.reduce((s, lb) => s + calcBlockDistance(lb, zones), 0)
      total += loopDist * reps
    } else {
      total += calcBlockDistance(b, zones) * reps
    }
  })
  return Math.round(total * 10) / 10
}

const EMPTY_BLOCK = { id: null, name: '', zone: 1, durationType: 'time', duration: 10, timeUnit: 'min', distance: 400, distUnit: 'm', lapMode: 'auto', isLoop: false, loopReps: 3, loopBlocks: [] }

export default function SessionBuilder({ draft, setDraft, zones }) {
  const [addingBlock, setAddingBlock] = useState(false)
  const [blockDraft, setBlockDraft] = useState({ ...EMPTY_BLOCK })
  const [addingLoopBlock, setAddingLoopBlock] = useState(false)
  const [loopBlockDraft, setLoopBlockDraft] = useState({ ...EMPTY_BLOCK })
  const [editingLoopIdx, setEditingLoopIdx] = useState(null)

  const blocks = draft.blocks || []

  const addBlock = () => {
    const newBlock = { ...blockDraft, id: Date.now().toString() }
    setDraft(d => ({ ...d, blocks: [...(d.blocks || []), newBlock] }))
    setAddingBlock(false)
    setBlockDraft({ ...EMPTY_BLOCK })
  }

  const addLoopBlock = () => {
    const newBlock = { ...loopBlockDraft, id: Date.now().toString() }
    setDraft(d => {
      const blocks = [...(d.blocks || [])]
      blocks[editingLoopIdx] = { ...blocks[editingLoopIdx], loopBlocks: [...(blocks[editingLoopIdx].loopBlocks || []), newBlock] }
      return { ...d, blocks }
    })
    setAddingLoopBlock(false)
    setLoopBlockDraft({ ...EMPTY_BLOCK })
  }

  const removeBlock = (idx) => setDraft(d => ({ ...d, blocks: d.blocks.filter((_, i) => i !== idx) }))
  const removeLoopBlock = (blockIdx, loopIdx) => {
    setDraft(d => {
      const blocks = [...d.blocks]
      blocks[blockIdx] = { ...blocks[blockIdx], loopBlocks: blocks[blockIdx].loopBlocks.filter((_, i) => i !== loopIdx) }
      return { ...d, blocks }
    })
  }

  const totalKm = calcTotalDistance(blocks, zones)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>STRUCTURE DE LA SÉANCE</div>
        {totalKm > 0 && <div style={{ fontSize: 12, color: '#4ade80' }}>≈ {totalKm} km calculés</div>}
      </div>

      {blocks.map((b, i) => {
        const z = zones[b.zone - 1]
        const st = SESSION_TYPE_OPTIONS.find(t => t.id === draft.session_type)
        return (
          <div key={b.id || i}>
            <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 10, border: `1px solid ${z?.color || '#334155'}33`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 6, height: 6, borderRadius: 1, background: z?.color, flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, fontSize: 11 }}>
                {b.isLoop ? (
                  <div>
                    <div style={{ color: '#e11d48', fontWeight: 600, marginBottom: 4 }}>🔁 {b.loopReps}× Boucle</div>
                    {(b.loopBlocks || []).map((lb, li) => {
                      const lz = zones[lb.zone - 1]
                      return (
                        <div key={li} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', marginBottom: 3, background: '#111827', borderRadius: 6, borderLeft: `2px solid ${lz?.color}` }}>
                          <span style={{ color: '#94a3b8' }}>{lb.name || `Z${lb.zone}`}</span>
                          <span style={{ color: '#64748b' }}>
                            {lb.durationType === 'time' ? `${lb.duration}${lb.timeUnit}` : `${lb.distance}${lb.distUnit}`}
                          </span>
                          <span style={{ color: lz?.color, marginLeft: 'auto' }}>{lz?.paceMax}–{lz?.paceMin}</span>
                          <button style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14 }} onClick={() => removeLoopBlock(i, li)}>×</button>
                        </div>
                      )
                    })}
                    {editingLoopIdx === i && addingLoopBlock ? (
                      <MiniBlockForm draft={loopBlockDraft} setDraft={setLoopBlockDraft} zones={zones} onAdd={addLoopBlock} onCancel={() => { setAddingLoopBlock(false); setEditingLoopIdx(null) }} />
                    ) : (
                      <button style={{ background: 'none', border: '1px dashed #334155', color: '#64748b', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: 11, marginTop: 4 }}
                        onClick={() => { setEditingLoopIdx(i); setAddingLoopBlock(true) }}>+ bloc dans la boucle</button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{b.name || `Z${b.zone} ${z?.short}`}</span>
                    <span style={{ color: '#64748b' }}>
                      {b.durationType === 'time' ? `${b.duration}${b.timeUnit}` : `${b.distance}${b.distUnit}`}
                    </span>
                    <span style={{ color: '#475569', fontSize: 10 }}>{b.lapMode === 'lap' ? '⌨ LAP' : '▶ Auto'}</span>
                    <span style={{ color: z?.color, marginLeft: 'auto' }}>{z?.paceMax}–{z?.paceMin}</span>
                  </div>
                )}
              </div>
              <button style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16 }} onClick={() => removeBlock(i)}>×</button>
            </div>
          </div>
        )
      })}

      {addingBlock ? (
        <div style={{ background: '#0a0f1a', borderRadius: 8, padding: 12, border: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 11, background: !blockDraft.isLoop ? '#1e293b' : 'transparent', color: !blockDraft.isLoop ? '#fff' : '#64748b' }}
              onClick={() => setBlockDraft(d => ({ ...d, isLoop: false }))}>Bloc simple</button>
            <button style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 11, background: blockDraft.isLoop ? '#e11d4833' : 'transparent', color: blockDraft.isLoop ? '#e11d48' : '#64748b' }}
              onClick={() => setBlockDraft(d => ({ ...d, isLoop: true }))}>🔁 Boucle (répétitions)</button>
          </div>

          {blockDraft.isLoop ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.06em' }}>NOMBRE DE RÉPÉTITIONS</div>
              <input className="input" type="number" min={1} value={blockDraft.loopReps} onChange={e => setBlockDraft(d => ({ ...d, loopReps: Number(e.target.value) }))} style={{ fontSize: 13 }} placeholder="ex: 6" />
              <div style={{ fontSize: 11, color: '#64748b' }}>Ajoute les blocs à l'intérieur de la boucle après création.</div>
            </div>
          ) : (
            <MiniBlockForm draft={blockDraft} setDraft={setBlockDraft} zones={zones} onAdd={addBlock} onCancel={() => setAddingBlock(false)} />
          )}

          {blockDraft.isLoop && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setAddingBlock(false)}>Annuler</button>
              <button className="btn-primary" style={{ fontSize: 11, flex: 1 }} onClick={addBlock}>Créer la boucle</button>
            </div>
          )}
        </div>
      ) : (
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setAddingBlock(true)}>+ Ajouter un bloc</button>
      )}
    </div>
  )
}

function MiniBlockForm({ draft, setDraft, zones, onAdd, onCancel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input className="input" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nom du bloc (ex: Échauffement, Corps, Récup…)" style={{ fontSize: 12 }} />
      <select className="input" value={draft.zone} onChange={e => setDraft(d => ({ ...d, zone: Number(e.target.value) }))} style={{ fontSize: 12 }}>
        {BASE_ZONES.map(z => <option key={z.id} value={z.id}>Z{z.id} — {z.name}</option>)}
      </select>

      {/* Duration type */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['time', 'distance'].map(t => (
          <button key={t} style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 11, background: draft.durationType === t ? '#1e293b' : 'transparent', color: draft.durationType === t ? '#fff' : '#64748b' }}
            onClick={() => setDraft(d => ({ ...d, durationType: t }))}>
            {t === 'time' ? '⏱ Temps' : '📏 Distance'}
          </button>
        ))}
      </div>

      {draft.durationType === 'time' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="number" value={draft.duration} onChange={e => setDraft(d => ({ ...d, duration: e.target.value }))} style={{ flex: 2, fontSize: 12 }} />
          <select className="input" value={draft.timeUnit} onChange={e => setDraft(d => ({ ...d, timeUnit: e.target.value }))} style={{ flex: 1, fontSize: 12 }}>
            {TIME_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" type="number" value={draft.distance} onChange={e => setDraft(d => ({ ...d, distance: e.target.value }))} style={{ flex: 2, fontSize: 12 }} />
          <select className="input" value={draft.distUnit} onChange={e => setDraft(d => ({ ...d, distUnit: e.target.value }))} style={{ flex: 1, fontSize: 12 }}>
            {DIST_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}

      {/* LAP mode */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[['auto', '▶ Enchaînement auto'], ['lap', '⌨ Touche LAP']].map(([v, l]) => (
          <button key={v} style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 10, background: draft.lapMode === v ? '#1e293b' : 'transparent', color: draft.lapMode === v ? '#fff' : '#64748b' }}
            onClick={() => setDraft(d => ({ ...d, lapMode: v }))}>{l}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost" style={{ fontSize: 11 }} onClick={onCancel}>Annuler</button>
        <button className="btn-primary" style={{ fontSize: 11, flex: 1 }} onClick={onAdd}>Ajouter</button>
      </div>
    </div>
  )
}
