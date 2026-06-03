import { useState } from 'react'


const SESSION_TYPES = [
  { id: 'EF', label: 'EF', color: '#6b7280' },
  { id: 'SEUIL', label: 'SL', color: '#fde047' },
  { id: 'VMA', label: 'VMA', color: '#f43f5e' },
  { id: 'FARTLEK', label: 'FK', color: '#a78bfa' },
  { id: 'COTES', label: 'CÔT', color: '#f97316' },
  { id: 'SORTIE', label: 'SL+', color: '#818cf8' },
  { id: 'PISTE', label: 'PST', color: '#22d3ee' },
  { id: 'RECUP', label: 'REC', color: '#94a3b8' },
  { id: 'REPOS', label: '—', color: '#1e293b' },
  { id: 'COMP', label: 'COMP', color: '#fbbf24' },
  { id: 'CROSS', label: 'CRS', color: '#84cc16' },
  { id: 'RENFO', label: 'RNF', color: '#fb923c' },
]

export default function MonthCalendar({ athleteId, getSlot, sessions, completions, onSlotClick, raceGoals }) {
  const [monthOffset, setMonthOffset] = useState(0)

  const now = new Date()
  const displayDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = displayDate.getFullYear()
  const month = displayDate.getMonth()
  const monthName = displayDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = (firstDay.getDay() + 6) % 7 // Monday first

  const days = []
  for (let i = 0; i < startDow; i++) days.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)

  const getDateKey = (d) => {
    const date = new Date(year, month, d)
    const monday = new Date(date)
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    const weekKey = monday.toISOString().slice(0, 10)
    const dayIndex = (date.getDay() + 6) % 7
    return { weekKey, dayIndex }
  }

  const getRaceOnDay = (d) => {
    if (!raceGoals || !d) return null
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return raceGoals.find(g => g.date === dateStr)
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn-ghost" onClick={() => setMonthOffset(o => o - 1)}>←</button>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, textTransform: 'capitalize' }}>{monthName}</div>
        <button className="btn-ghost" onClick={() => setMonthOffset(o => o + 1)}>→</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 10, color: '#475569', padding: '4px 0', letterSpacing: '0.06em' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map((d, i) => {
          if (!d) return <div key={i} />
          const { weekKey, dayIndex } = getDateKey(d)
          const slot = getSlot ? getSlot(athleteId, weekKey, dayIndex) : null
          const compKey = `${athleteId}__${weekKey}__${dayIndex}`
          const comp = completions?.[compKey]
          const st = slot?.session_type ? SESSION_TYPES.find(t => t.id === slot.session_type) : null
          const sess = slot?.session_id ? sessions?.find(s => s.id === slot.session_id) : null
          const race = getRaceOnDay(d)
          const isToday = new Date().getDate() === d && new Date().getMonth() === month && new Date().getFullYear() === year

          return (
            <div key={i} onClick={() => onSlotClick && onSlotClick({ weekKey, dayIndex, slot })}
              style={{ minHeight: 52, borderRadius: 6, background: isToday ? '#1a2235' : '#111827', border: `1px solid ${isToday ? '#334155' : '#1e293b'}`, padding: '4px', cursor: 'pointer', transition: 'all 0.1s', position: 'relative' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#334155'}
              onMouseLeave={e => e.currentTarget.style.borderColor = isToday ? '#334155' : '#1e293b'}>
              <div style={{ fontSize: 10, color: isToday ? '#e11d48' : '#475569', fontWeight: isToday ? 700 : 400, marginBottom: 2 }}>{d}</div>
              {race && (
                <div style={{ background: race.goal_type === 'primary' ? '#fbbf24' : '#64748b', borderRadius: 3, padding: '1px 4px', fontSize: 9, color: '#000', marginBottom: 2, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  🏆 {race.name}
                </div>
              )}
              {slot && slot.session_type !== 'REPOS' && st && (
                <div style={{ background: (comp ? '#4ade80' : st.color) + '33', borderRadius: 3, padding: '1px 4px', fontSize: 9, color: comp ? '#4ade80' : st.color, fontWeight: 600 }}>
                  {comp ? '✓' : ''} {st.label}
                  {slot.km > 0 && <span style={{ color: '#64748b', marginLeft: 3 }}>{slot.km}k</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
