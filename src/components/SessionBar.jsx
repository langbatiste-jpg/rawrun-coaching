import { BASE_ZONES } from '../../shared/training.js'

// Profil visuel de la séance : hauteur = intensité, largeur = durée
export default function SessionBar({ blocks }) {
  const flat = []
  for (const b of blocks) { if (b.isLoop) { for (let r = 0; r < Math.min(b.loopReps || 1, 30); r++) (b.loopBlocks || []).forEach(lb => flat.push(lb)) } else flat.push(b) }
  if (!flat.length) return null
  const w = b => b.durationType === 'time' ? (b.timeUnit === 'h' ? b.duration * 60 : b.timeUnit === 'sec' ? b.duration / 60 : Number(b.duration)) : (b.distUnit === 'km' ? b.distance * 5 : b.distance / 200)
  return (
    <div className="session-bar-wrap">
      {flat.map((b, i) => { const z = BASE_ZONES[b.zone - 1]; return <div key={i} style={{ flex: Math.max(0.3, w(b) || 1), height: `${25 + (b.zone / 14) * 75}%`, background: z?.color }} /> })}
    </div>
  )
}

