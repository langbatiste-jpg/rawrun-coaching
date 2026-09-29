// ─── Fenêtre modale ───
export function Overlay({ children, onClose, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-scroll" role="dialog" aria-modal="true" style={{ maxWidth: wide ? 900 : 520 }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

// ─── Champ de formulaire ───
export function FG({ label, children }) {
  return (
    <div className="fg">
      <div className="fg-label">{label}</div>
      {children}
    </div>
  )
}

// ─── Navigation de semaine ───
export function WeekNav({ weekKey, offset, setOffset }) {
  const d = new Date(weekKey + 'T12:00')
  const end = new Date(d); end.setDate(d.getDate() + 6)
  const fmt = x => x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button className="btn-ghost btn-sm" aria-label="Semaine précédente" onClick={() => setOffset(o => o - 1)}>←</button>
      <span className="num" style={{ fontSize: 12.5, color: 'var(--text-2)', minWidth: 118, textAlign: 'center' }}>{fmt(d)} – {fmt(end)}</span>
      {offset !== 0 && <button className="btn-ghost btn-sm" onClick={() => setOffset(0)}>Auj.</button>}
      <button className="btn-ghost btn-sm" aria-label="Semaine suivante" onClick={() => setOffset(o => o + 1)}>→</button>
    </div>
  )
}

// ─── Ligne de zone d'allure ───
export function ZoneBadge({ zone, paceMin, paceMax, easy = false }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 14px', background: 'var(--glass)', border: '1px solid var(--border)', borderRadius: 12, borderLeft: `3px solid ${zone.color}` }}>
      <div className="display" style={{ fontSize: 22, width: 38, color: zone.color }}>Z{zone.id}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{zone.name}</div>
        <div className="muted" style={{ fontSize: 12 }}>{zone.short}</div>
      </div>
      {easy ? <div style={{ fontSize: 13, color: zone.color, textAlign: 'right' }}>aux sensations<div className="num muted" style={{ fontSize: 11 }}>≈ {paceMax}–{paceMin}</div></div>
        : <div className="num" style={{ fontSize: 15, color: zone.color }}>{paceMax}–{paceMin}<span className="muted" style={{ fontSize: 11 }}> /km</span></div>}
    </div>
  )
}
