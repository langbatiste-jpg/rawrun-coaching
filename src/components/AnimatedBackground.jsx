import { useEffect, useRef } from 'react'

// Fond animé RAWRUN : des lignes de niveau qui ondulent comme une carte de trail,
// et un « coureur » orange qui trace sa route. Se fige si l'utilisateur préfère moins d'animations.
export default function AnimatedBackground({ calm = false }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobile = window.matchMedia('(max-width: 860px)').matches
    let w = 0, h = 0, dpr = 1, raf = 0, t = Math.random() * 100
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 }
    const LINES = mobile ? 16 : 26
    const STEP = mobile ? 22 : 16
    const trail = []

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // Relief doux : somme de sinus (pas besoin de lib de bruit)
    const field = (x, y, time) =>
      Math.sin(x * 0.0042 + time * 0.35 + y * 0.002) * 26 +
      Math.sin(x * 0.0091 - time * 0.22 + y * 0.004) * 14 +
      Math.sin((x + y) * 0.0023 + time * 0.12) * 34

    const lineY = (i, x, time) => {
      const base = (i + 0.5) * (h / LINES)
      let y = base + field(x, base, time) * (0.6 + (i % 5) * 0.12)
      const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy
      if (d2 < 32000) y += (dy >= 0 ? 1 : -1) * (1 - d2 / 32000) * 28
      return y
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      mouse.x += (mouse.tx - mouse.x) * 0.08
      mouse.y += (mouse.ty - mouse.y) * 0.08
      for (let i = 0; i < LINES; i++) {
        ctx.beginPath()
        for (let x = -STEP; x <= w + STEP; x += STEP) {
          const y = lineY(i, x, t)
          x === -STEP ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        const major = i % 5 === 2
        ctx.strokeStyle = major ? `rgba(255,255,255,${calm ? 0.07 : 0.1})` : `rgba(255,255,255,${calm ? 0.03 : 0.045})`
        ctx.lineWidth = major ? 1.1 : 0.8
        ctx.stroke()
      }
      // Le coureur : suit une ligne majeure, de gauche à droite
      const lane = Math.min(LINES - 1, 7)
      const period = mobile ? 14 : 22
      const px = ((t % period) / period) * (w + 200) - 100
      const py = lineY(lane, px, t)
      trail.push([px, py]); if (trail.length > 70) trail.shift()
      if (trail.length > 1) {
        for (let k = 1; k < trail.length; k++) {
          const [x0, y0] = trail[k - 1], [x1, y1] = trail[k]
          if (Math.abs(x1 - x0) > 60) continue
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1)
          ctx.strokeStyle = `rgba(255,90,31,${(k / trail.length) * 0.75})`
          ctx.lineWidth = 2; ctx.stroke()
        }
      }
      const g = ctx.createRadialGradient(px, py, 0, px, py, 18)
      g.addColorStop(0, 'rgba(255,90,31,.9)'); g.addColorStop(1, 'rgba(255,90,31,0)')
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffd2bf'; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, Math.PI * 2); ctx.fill()
    }

    let last = performance.now()
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      t += dt
      draw()
      raf = requestAnimationFrame(loop)
    }
    const onMove = e => { const p = e.touches?.[0] || e; mouse.tx = p.clientX; mouse.ty = p.clientY }
    const onLeave = () => { mouse.tx = -9999; mouse.ty = -9999 }
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(loop) } }

    resize(); draw()
    window.addEventListener('resize', resize)
    if (!reduce) {
      raf = requestAnimationFrame(loop)
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerleave', onLeave)
      document.addEventListener('visibilitychange', onVis)
    }
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [calm])

  return (
    <div className={`rr-bg ${calm ? 'calm' : ''}`} aria-hidden="true">
      <div className="rr-bg-orb a" />
      <div className="rr-bg-orb b" />
      <canvas ref={ref} />
      <div className="rr-bg-grain" />
    </div>
  )
}
