import { useMemo } from 'react'
import { getWeekKey } from '../utils'
import { loadRatio } from '../lib/insights'

// Volume prévu vs réalisé sur 8 semaines + ratio charge aiguë / chronique
export default function LoadChart({ athleteId, completions = {}, weekData = {}, weeks = 8 }) {
  const data = useMemo(() => {
    const out = []
    for (let i = weeks - 1; i >= -1; i--) {
      const wk = getWeekKey(-i)
      let planned = 0, realized = 0
      for (let d = 0; d < 7; d++) {
        const key = `${athleteId}__${wk}__${d}`
        planned += Number(weekData[key]?.km) || 0
        const c = completions[key]
        if (c) realized += Number(c.real_km) || Number(weekData[key]?.km) || 0
      }
      out.push({ wk, planned: Math.round(planned), realized: Math.round(realized), future: i === -1, current: i === 0 })
    }
    return out
  }, [athleteId, completions, weekData, weeks])
  const { acute, chronic, ratio } = loadRatio(athleteId, completions, weekData)
  const max = Math.max(10, ...data.map(d => Math.max(d.planned, d.realized)))
  const W = 100 / data.length
  const ratioColor = ratio === null ? 'var(--text-3)' : ratio > 1.5 ? 'var(--danger)' : ratio > 1.3 ? 'var(--gold)' : ratio < 0.8 ? 'var(--text-2)' : 'var(--lime)'
  const ratioText = ratio === null ? 'Pas assez de retours de séance' : ratio > 1.5 ? 'Hausse brutale : risque de blessure' : ratio > 1.3 ? 'Charge qui monte vite' : ratio < 0.8 ? 'Charge en baisse' : 'Zone de progression'

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><b>Volume</b><div className="muted" style={{ fontSize: 12.5 }}>Prévu (contour) et réalisé (plein), en km</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 20, color: ratioColor }}>{ratio === null ? '—' : `×${ratio.toFixed(2)}`}</div>
          <div className="muted" style={{ fontSize: 12 }}>{ratioText}</div>
        </div>
      </div>
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: '100%', height: 130, display: 'block', overflow: 'visible' }} role="img" aria-label="Volume hebdomadaire">
        {data.map((d, i) => {
          const x = i * W + W * 0.18, bw = W * 0.64
          const hp = (d.planned / max) * 38, hr = (d.realized / max) * 38
          return (
            <g key={d.wk}>
              <rect x={x} y={40 - hp} width={bw} height={hp} rx="0.8" fill="none" stroke={d.current ? 'rgba(255,90,31,.8)' : 'rgba(255,255,255,.22)'} strokeWidth="0.35" strokeDasharray={d.future ? '1 0.8' : ''} vectorEffect="non-scaling-stroke" />
              {hr > 0 && <rect x={x} y={40 - hr} width={bw} height={hr} rx="0.8" fill={d.current ? '#ff5a1f' : '#c8ff2e'} opacity={d.current ? 1 : 0.85} />}
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, marginTop: 6 }}>
        {data.map(d => (
          <div key={d.wk} style={{ textAlign: 'center', fontSize: 10.5, color: d.current ? 'var(--accent)' : 'var(--text-4)' }} className="num">
            <div style={{ color: 'var(--text-2)' }}>{d.realized || (d.future ? d.planned : 0)}</div>
            {new Date(d.wk + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' })}
          </div>
        ))}
      </div>
      {chronic > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Charge (RPE × km) : {acute} sur 7 jours, {chronic} en moyenne hebdo sur 4 semaines.</div>}
    </div>
  )
}
