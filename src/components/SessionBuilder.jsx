import { useState } from 'react'
import { BASE_ZONES } from '../constants'
import { secsToPace, parsePace } from '../utils'

const TIME_UNITS = ['sec', 'min', 'h']
const DIST_UNITS = ['m', 'km']

function toSeconds(val, unit) {
  if (unit === 'sec') return Number(val)
  if (unit === 'min') return Number(val) * 60
  if (unit === 'h') return Number(val) * 3600
  return Number(val)
}

export function calcBlockDistance(block, zones) {
  if (block.durationType === 'distance') {
    return block.distUnit === 'km' ? Number(block.distance) : Number(block.distance) / 1000
  }
  const z = zones[block.zone - 1]
  if (!z || !z.paceMin || z.paceMin === '—') return 0
  const paceSecs = parsePace(z.paceMin)
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
  const totalKm = calcTotalDistance(blocks, zones)

  const addBlock = () => {
    const newBlock = { ...blockDraft, id: Date.now().toString() }
    setDraft(d => ({ ...d, blocks: [...(d.blocks || []), newBlock] }))
    setAddingBlock(false)
    setBlockDraft({ ...EMPTY_BLOCK })
  }

  const addLoopBlock = () => {
    const newBlock = { ...loopBlockDraft, id: Date.now().toString() }
    setDraft(d => {
      const bs = [...(d.blocks || [])]
      bs[editingLoopIdx] = { ...bs[editingLoopIdx], loopBlocks: [...(bs[editingLoopIdx].loopBlocks || []), newBlock] }
      return { ...d, blocks: bs }
    })
    setAddingLoopBlock(false)
    setLoopBlockDraft({ ...EMPTY_BLOCK })
  }

  const removeBlock = (idx) => setDraft(d => ({ ...d, blocks: d.blocks.filter((_, i) => i !== idx) }))
  const removeLoopBlock = (blockIdx, loopIdx) => {
    setDraft(d => {
      const bs = [...d.blocks]
      bs[blockIdx] = { ...bs[blockIdx], loopBlocks: bs[blockIdx].loopBlocks.filter((_, i) => i !== loopIdx) }
      return { ...d, blocks: bs }
    })
  }

  // Move block up or down
  const moveBlock = (idx, dir) => {
    setDraft(d => {
      const bs = [...d.blocks]
      const target = idx + dir
      if (target < 0 || target >= bs.length) return d
      ;[bs[idx], bs[target]] = [bs[target], bs[idx]]
      return { ...d, blocks: bs }
    })
  }

  // Move loop block up or down
  const moveLoopBlock = (blockIdx, loopIdx, dir) => {
    setDraft(d => {
      const bs = [...d.blocks]
      const lbs = [...bs[blockIdx].loopBlocks]
      const target = loopIdx + dir
      if (target < 0 || target >= lbs.length) return d
      ;[lbs[loopIdx], lbs[target]] = [lbs[target], lbs[loopIdx]]
      bs[blockIdx] = { ...bs[blockIdx], loopBlocks: lbs }
      return { ...d, blocks: bs }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="fg-label">Structure de la séance</div>
        {totalKm > 0 && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>≈ {totalKm} km</div>}
      </div>

      {blocks.map((b, i) => {
        const z = zones[b.zone - 1]
        return (
          <div key={b.id || i} className="block-item">
            <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 10, border: `1px solid ${z?.color || 'var(--border)'}33`, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              {/* Reorder arrows */}
              <div className="block-arrows">
                <button className="block-arrow-btn" onClick={() => moveBlock(i, -1)} disabled={i === 0}>↑</button>
                <button className="block-arrow-btn" onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1}>↓</button>
              </div>
              <div style={{ width: 6, height: 6, borderRadius: 1, background: z?.color, flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1, fontSize: 11 }}>
                {b.isLoop ? (
                  <div>
                    <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 6, fontSize: 12 }}>🔁 {b.loopReps}× Boucle</div>
                    {(b.loopBlocks || []).map((lb, li) => {
                      const lz = zones[lb.zone - 1]
                      return (
                        <div key={li} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 8px', marginBottom: 3, background: 'var(--bg-3)', borderRadius: 6, borderLeft: `2px solid ${lz?.color}` }}>
                          <div className="block-arrows" style={{ flexDirection: 'row' }}>
                            <button className="block-arrow-btn" style={{ width: 16, height: 16, fontSize: 8 }} onClick={() => moveLoopBlock(i, li, -1)} disabled={li === 0}>↑</button>
                            <button className="block-arrow-btn" style={{ width: 16, height: 16, fontSize: 8 }} onClick={() => moveLoopBlock(i, li, 1)} disabled={li === b.loopBlocks.length - 1}>↓</button>
                          </div>
                          <span style={{ color: 'var(--text-2)', flex: 1 }}>{lb.name || `Z${lb.zone}`}</span>
                          <span style={{ color: 'var(--text-3)' }}>{lb.durationType === 'time' ? `${lb.duration}${lb.timeUnit}` : `${lb.distance}${lb.distUnit}`}</span>
                          <span style={{ color: lz?.color, fontWeight: 600 }}>{lz?.paceMax}–{lz?.paceMin}</span>
                          <button style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14 }} onClick={() => removeLoopBlock(i, li)}>×</button>
                        </div>
                      )
                    })}
                    {editingLoopIdx === i && addingLoopBlock ? (
                      <MiniBlockForm draft={loopBlockDraft} setDraft={setLoopBlockDraft} zones={zones} onAdd={addLoopBlock} onCancel={() => { setAddingLoopBlock(false); setEditingLoopIdx(null) }} />
                    ) : (
                      <button style={{ background: 'none', border: '1px dashed var(--border-2)', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: 11, marginTop: 4, width: '100%' }}
                        onClick={() => { setEditingLoopIdx(i); setAddingLoopBlock(true) }}>+ bloc dans la boucle</button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{b.name || `Z${b.zone} ${z?.short}`}</span>
                    <span style={{ color: 'var(--text-3)' }}>{b.durationType === 'time' ? `${b.duration}${b.timeUnit}` : `${b.distance}${b.distUnit}`}</span>
                    <span style={{ color: 'var(--text-4)', fontSize: 10 }}>{b.lapMode === 'lap' ? '⌨ LAP' : '▶ Auto'}</span>
                    <span style={{ color: z?.color, fontWeight: 600, marginLeft: 'auto' }}>{z?.paceMax}–{z?.paceMin}</span>
                  </div>
                )}
              </div>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }} onClick={() => removeBlock(i)}>×</button>
            </div>
          </div>
        )
      })}

      {addingBlock ? (
        <div style={{ background: 'var(--bg-2)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <button style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 500, background: !blockDraft.isLoop ? 'var(--bg-4)' : 'transparent', color: !blockDraft.isLoop ? '#fff' : 'var(--text-3)' }}
              onClick={() => setBlockDraft(d => ({ ...d, isLoop: false }))}>Bloc simple</button>
            <button style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 500, background: blockDraft.isLoop ? 'var(--red-glow)' : 'transparent', color: blockDraft.isLoop ? 'var(--red)' : 'var(--text-3)' }}
              onClick={() => setBlockDraft(d => ({ ...d, isLoop: true }))}>🔁 Boucle (répétitions)</button>
          </div>
          {blockDraft.isLoop ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="fg-label">Nombre de répétitions</div>
              <input className="input" type="number" min={1} value={blockDraft.loopReps} onChange={e => setBlockDraft(d => ({ ...d, loopReps: Number(e.target.value) }))} placeholder="ex: 6" />
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Tu pourras ajouter les blocs à l'intérieur après création.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost btn-sm" onClick={() => setAddingBlock(false)}>Annuler</button>
                <button className="btn-primary btn-sm" style={{ flex: 1 }} onClick={addBlock}>Créer la boucle</button>
              </div>
            </div>
          ) : (
            <MiniBlockForm draft={blockDraft} setDraft={setBlockDraft} zones={zones} onAdd={addBlock} onCancel={() => setAddingBlock(false)} />
          )}
        </div>
      ) : (
        <button className="btn-ghost btn-sm" onClick={() => setAddingBlock(true)}>+ Ajouter un bloc</button>
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
      <div style={{ display: 'flex', gap: 3, background: 'var(--bg-3)', borderRadius: 6, padding: 3 }}>
        {['time', 'distance'].map(t => (
          <button key={t} style={{ flex: 1, padding: '5px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 500, background: draft.durationType === t ? 'var(--bg-4)' : 'transparent', color: draft.durationType === t ? '#fff' : 'var(--text-3)' }}
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
      <div style={{ display: 'flex', gap: 3, background: 'var(--bg-3)', borderRadius: 6, padding: 3 }}>
        {[['auto', '▶ Auto'], ['lap', '⌨ LAP']].map(([v, l]) => (
          <button key={v} style={{ flex: 1, padding: '5px', borderRadius: 4, border: 'none', cursor: 'pointer', fontFamily: "'Space Grotesk'", fontSize: 11, fontWeight: 500, background: draft.lapMode === v ? 'var(--bg-4)' : 'transparent', color: draft.lapMode === v ? '#fff' : 'var(--text-3)' }}
            onClick={() => setDraft(d => ({ ...d, lapMode: v }))}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
        <button className="btn-primary btn-sm" style={{ flex: 1 }} onClick={onAdd}>Ajouter le bloc</button>
      </div>
    </div>
  )
}
