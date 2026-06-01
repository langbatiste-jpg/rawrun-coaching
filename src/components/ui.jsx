// ─── Overlay / Modal wrapper ───
export function Overlay({ children, onClose, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-scroll" style={{ maxWidth: wide ? 820 : 520 }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ─── Form group ───
export function FG({ label, children }) {
  return (
    <div className="fg">
      <div className="fg-label">{label}</div>
      {children}
    </div>
  )
}

// ─── Week nav ───
export function WeekNav({ weekKey, offset, setOffset }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="btn-ghost" onClick={() => setOffset(o => o - 1)}>←</button>
      <span style={{ fontSize: 12, color: '#64748b', minWidth: 90, textAlign: 'center' }}>{weekKey}</span>
      <button className="btn-ghost" onClick={() => setOffset(0)} style={{ fontSize: 11 }}>Auj.</button>
      <button className="btn-ghost" onClick={() => setOffset(o => o + 1)}>→</button>
    </div>
  )
}

// ─── Zone badge ───
export function ZoneBadge({ zone, paceMin, paceMax }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 13px', background: '#0a0f1a', borderRadius: 8, borderLeft: `3px solid ${zone.color}` }}>
      <div style={{ width: 5, height: 5, borderRadius: 1, background: zone.color, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500 }}>{zone.name}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>Z{zone.id} — {zone.short}</div>
      </div>
      <div style={{ fontSize: 13, color: zone.color, fontWeight: 700 }}>{paceMax} – {paceMin}<span style={{ fontSize: 10, color: '#475569', fontWeight: 400 }}> /km</span></div>
    </div>
  )
}
