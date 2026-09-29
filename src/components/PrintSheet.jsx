import { createPortal } from 'react-dom'
import { BRAND } from '../../shared/brand.js'
import { SESSION_TYPES, BASE_ZONES, blocksToText, showPace } from '../../shared/training.js'

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Rendu imprimable d'un plan (style du site). Le navigateur propose « Enregistrer en PDF ».
export function printPlan(setPrintData, data) {
  setPrintData(data)
  setTimeout(() => { window.print(); setTimeout(() => setPrintData(null), 500) }, 150)
}

export default function PrintSheet({ data }) {
  if (!data) return null
  const { title, subtitle, athlete, zones, weeks = [], summary } = data
  const usedZones = new Set()
  weeks.forEach(w => (w.days || []).forEach(d => (d.blocks || []).forEach(b => { usedZones.add(b.zone); (b.loopBlocks || []).forEach(lb => usedZones.add(lb.zone)) })))
  const z = id => zones?.[id - 1] || BASE_ZONES[id - 1]
  const fmtBlock = b => `${b.name ? b.name + ' · ' : ''}${b.durationType === 'time' ? `${b.duration} ${b.timeUnit}` : `${b.distance} ${b.distUnit}`} Z${b.zone}${!showPace(b.zone) ? ' (aux sensations)' : z(b.zone)?.paceMax && z(b.zone).paceMax !== '—' ? ` (${z(b.zone).paceMax}–${z(b.zone).paceMin})` : ''}`

  return createPortal(
    <div className="print-only">
      <style>{`
        .ps { font-size: 10.5pt; color: #f4f4f5; }
        .ps h1 { font-family: 'Bebas Neue', sans-serif; font-size: 44pt; line-height: .9; margin: 0; }
        .ps h1 span { color: #ff5a1f; }
        .ps .sub { color: #a1a1aa; margin: 4pt 0 14pt; }
        .ps .zones { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4pt 10pt; font-size: 8.5pt; margin-bottom: 14pt; padding: 8pt; border: 1px solid #27272a; border-radius: 6pt; }
        .ps .wk { break-inside: avoid; margin-bottom: 12pt; border-top: 2px solid #ff5a1f; padding-top: 6pt; }
        .ps .wk h2 { font-family: 'Bebas Neue', sans-serif; font-size: 18pt; margin: 0 0 4pt; letter-spacing: .02em; }
        .ps .wk h2 small { font-family: 'Space Grotesk', sans-serif; font-size: 9pt; color: #a1a1aa; margin-left: 8pt; }
        .ps .day { display: grid; grid-template-columns: 58pt 1fr 52pt; gap: 8pt; padding: 5pt 0; border-bottom: 1px solid #1f1f23; }
        .ps .day b { color: #fff; }
        .ps .blk { color: #c8c8cf; font-size: 9pt; margin-top: 2pt; }
        .ps .note { color: #c8ff2e; font-size: 9pt; margin-top: 2pt; }
        .ps .km { text-align: right; font-family: 'Space Mono', monospace; white-space: nowrap; }
      `}</style>
      <div className="ps">
        <h1>{BRAND.name}<span>{BRAND.accent}</span> {title}</h1>
        <div className="sub">{[athlete, subtitle, `Plan rédigé par ${BRAND.coach}`].filter(Boolean).join(' · ')}</div>
        {summary && <p style={{ marginBottom: '12pt', color: '#d4d4d8' }}>{summary}</p>}
        {usedZones.size > 0 && (
          <div className="zones">
            {[...usedZones].filter(id => showPace(id)).sort((a, b) => a - b).map(id => <div key={id}><b style={{ color: z(id).color }}>Z{id}</b> {z(id).short} · {z(id).paceMax}–{z(id).paceMin}/km</div>)}
          </div>
        )}
        {weeks.map(w => (
          <div className="wk" key={w.week_key || w.week}>
            <h2>{w.label || `Semaine ${w.week}`}<small>{w.week_key ? `du ${new Date(w.week_key + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}{w.phase ? ` · ${w.phase}` : ''} · {w.pending ? `~${w.target_km}` : Math.round((w.days || []).reduce((s, d) => s + (Number(d.km) || 0), 0))} km</small></h2>
            {w.pending ? <div className="blk">{w.focus} — environ {w.target_km} km (séances à détailler)</div> : (w.days || []).length === 0 && <div className="blk">Repos</div>}
            {(w.days || []).map((d, i) => {
              const st = SESSION_TYPES.find(t => t.id === d.session_type)
              return (
                <div className="day" key={i}>
                  <div style={{ color: st?.color }}>{DAYS[d.day_index]}</div>
                  <div>
                    <b>{d.name || st?.label}</b>
                    {d.blocks?.length > 0 && <div className="blk">{d.blocks.map(b => b.isLoop ? `${b.loopReps} × [${(b.loopBlocks || []).map(fmtBlock).join(' + ')}]` : fmtBlock(b)).join('  ›  ')}</div>}
                    {!d.blocks?.length && d.description && <div className="blk">{d.description}</div>}
                    {d.note && <div className="note">{d.note}</div>}
                  </div>
                  <div className="km">{d.km ? `${d.km} km` : ''}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}

export { blocksToText }
