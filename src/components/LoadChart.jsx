import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { getWeekKey } from '../utils'

export default function LoadChart({ athleteId, weeks = 8 }) {
  const [data, setData] = useState([])

  useEffect(() => { if (athleteId) loadData() }, [athleteId])

  const loadData = async () => {
    const weekKeys = []
    for (let i = weeks - 1; i >= 0; i--) weekKeys.push(getWeekKey(-i))

    const { data: slots } = await supabase.from('week_slots').select('*').eq('athlete_id', athleteId).in('week_key', weekKeys)
    const { data: completions } = await supabase.from('completions').select('*').eq('athlete_id', athleteId)

    const compMap = {}
    completions?.forEach(c => { compMap[c.session_key] = c })

    const weekData = weekKeys.map(wk => {
      const weekSlots = slots?.filter(s => s.week_key === wk) || []
      const planned = weekSlots.reduce((s, d) => s + (d.km || 0), 0)
      const realized = weekSlots.reduce((s, d) => {
        const key = `${athleteId}__${wk}__${d.day_index}`
        return s + (compMap[key]?.real_km || 0)
      }, 0)
      return { wk: wk.slice(5), planned, realized }
    })
    setData(weekData)
  }

  const maxKm = Math.max(...data.map(d => Math.max(d.planned, d.realized)), 10)

  return (
    <div style={{ background: '#0a0f1a', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.06em', marginBottom: 12 }}>CHARGE D'ENTRAÎNEMENT — {weeks} SEMAINES</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 72 }}>
              <div style={{ flex: 1, height: Math.round((d.planned / maxKm) * 70), background: '#334155', borderRadius: '2px 2px 0 0', minHeight: 2 }} title={`Planifié: ${d.planned}km`} />
              <div style={{ flex: 1, height: Math.round((d.realized / maxKm) * 70), background: '#e11d48', borderRadius: '2px 2px 0 0', minHeight: d.realized > 0 ? 2 : 0 }} title={`Réalisé: ${d.realized}km`} />
            </div>
            <div style={{ fontSize: 9, color: '#334155' }}>{d.wk}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ width: 10, height: 10, background: '#334155', borderRadius: 2 }} />
          <span style={{ color: '#64748b' }}>Planifié</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ width: 10, height: 10, background: '#e11d48', borderRadius: 2 }} />
          <span style={{ color: '#64748b' }}>Réalisé</span>
        </div>
      </div>
    </div>
  )
}
