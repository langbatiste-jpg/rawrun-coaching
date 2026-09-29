import { useEffect, useRef, useState, useMemo } from 'react'
import LoginPanel from './LoginPanel'
import { CoachingOffers, Boutique, OrderBanner } from './Shop'
import Wordmark from './Wordmark'
import { BRAND } from '../../shared/brand.js'
import { athleteZones, secsToPace } from '../../shared/training.js'
import './landing.css'

// Page d'accueil publique : chaque section « épinglée » avance avec le défilement.
// Le défilement règle une variable CSS --p (0 → 1) par section : aucun re-rendu React à chaque image.
function useScrollScenes(root) {
  const [steps, setSteps] = useState({})
  useEffect(() => {
    const el = root.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scenes = [...el.querySelectorAll('[data-scene]')]
    if (reduce) { scenes.forEach(s => s.style.setProperty('--p', 1)); setSteps(Object.fromEntries(scenes.map(s => [s.dataset.scene, 99]))); return }
    let raf = 0
    const last = {}
    const update = () => {
      raf = 0
      const vh = window.innerHeight
      for (const s of scenes) {
        const r = s.getBoundingClientRect()
        const span = Math.max(1, r.height - vh)
        const p = Math.min(1, Math.max(0, -r.top / span))
        s.style.setProperty('--p', p.toFixed(4))
        const n = Number(s.dataset.steps || 0)
        if (n) {
          const step = Math.min(n, Math.floor(p * (n + 0.35)))
          if (last[s.dataset.scene] !== step) { last[s.dataset.scene] = step; setSteps(x => ({ ...x, [s.dataset.scene]: step })) }
        }
      }
      // barre du haut : fond plus opaque après le premier écran
      el.style.setProperty('--top', Math.min(1, window.scrollY / 300).toFixed(3))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [])
  return steps
}

// Profil d'une séance type : 30' EF / 6 × 1000 m / 10' RAC
const SESSION = [
  { w: 30, h: 26, c: '#8b8b94', label: 'warm' },
  ...Array.from({ length: 6 }, () => [{ w: 3.8, h: 150, c: '#ff5a1f' }, { w: 1.6, h: 20, c: '#55555d' }]).flat(),
  { w: 10, h: 18, c: '#71717a', label: 'cool' },
]

// Les 14 zones regroupées en 5 familles faciles à comprendre
const FAMILIES = [
  { name: 'Facile', zones: [1, 2], easy: true, color: '#a1a1aa', why: "L'essentiel de ta semaine. Construit ton moteur sans fatigue : tu dois pouvoir parler." },
  { name: 'Endurance active', zones: [3, 4], color: '#38bdf8', why: 'Un cran au-dessus : tu apprends à tenir longtemps à bonne vitesse.' },
  { name: 'Allure course', zones: [5, 6, 7], color: '#c8ff2e', why: "L'allure de ton objectif (marathon, semi), répétée jusqu'à ce qu'elle te semble facile." },
  { name: 'Seuil', zones: [8, 9], color: '#fbbf24', why: 'Repousse le moment où les jambes brûlent. Le moteur du 10 km.' },
  { name: 'Vitesse', zones: [10, 11, 12, 13, 14], color: '#ff5a1f', why: 'Courtes et rapides : ton allure course devient confortable.' },
]

const VERSUS = [
  ['Ton plan', 'Généré à partir de 3 questions, le même que pour des milliers de coureurs', 'Construit sur tes chronos, ton historique et ton emploi du temps'],
  ['Mauvaise nuit, grosse semaine au boulot', "Ne le sait pas, la séance reste la même", 'Lit ton ressenti après chaque séance et ajuste la semaine'],
  ['Une douleur qui arrive', 'Continue comme si de rien n\'était', 'Repère le signal au check-in et adapte avant la blessure'],
  ['Tes questions', 'Une FAQ', 'Un vrai échange : chat, appels, stratégie de course'],
  ['La motivation', 'Des notifications que tu finis par ignorer', "Quelqu'un attend ton retour de séance"],
]

export default function Landing({ onAthleteLogin, onCoachLogin, showToast }) {
  const root = useRef(null)
  const steps = useScrollScenes(root)
  useEffect(() => {
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add('in')), { threshold: .2 })
    root.current.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 90}ms`; io.observe(el) })
    return () => io.disconnect()
  }, [])
  const [loginSignal, setLoginSignal] = useState(null)
  const [ten, setTen] = useState(45 * 60)
  const zones = useMemo(() => athleteZones({ records: [{ distance: '10km', time: secsToPace(ten) }] }), [ten])
  const goLogin = mode => { setLoginSignal({ mode, t: Date.now() }); document.getElementById('connexion')?.scrollIntoView({ behavior: 'smooth' }) }

  let x = 0
  const total = SESSION.reduce((s, b) => s + b.w, 0)
  const bars = SESSION.map((b, i) => { const r = { ...b, x: (x / total) * 1000, width: (b.w / total) * 1000 - 3 }; x += b.w; return r })
  const sessionStep = steps.session ?? 0

  return (
    <div className="landing" ref={root}>
      <OrderBanner />
      <header className="l-top">
        <Wordmark className="l-logo" />
        <nav className="l-top-links">
          <a href="#methode">La méthode</a>
          <a href="#zones">Tes allures</a>
          <a href="#appli">L'appli</a>
          <a href="#offres">Tarifs</a>
          <a href="#boutique">Boutique</a>
        </nav>
        <button className="btn-primary btn-sm" onClick={() => goLogin('code')}>Se connecter</button>
      </header>

      {/* 1 · HERO */}
      <section className="l-scene l-hero" data-scene="hero" style={{ height: '220vh' }}>
        <div className="l-sticky">
          <h1 className="l-hero-word" aria-label={BRAND.name}>
            {[...BRAND.name].map((ch, k) => <span key={k} style={{ '--k': k - (BRAND.name.length - 1) / 2 }}>{ch}</span>)}
            <span className="dot" style={{ '--k': (BRAND.name.length + 1) / 2 }}>{BRAND.accent}</span>
          </h1>
          <div className="l-hero-sub">
            <p className="l-kicker">{BRAND.tagline}</p>
            <p className="l-lead">Chaque séance a une intention.<br />Chaque allure est la tienne.</p>
          </div>
          <div className="l-hero-after">
            <p className="l-big">Un plan construit autour de toi,<br /><em>pas un tableau copié-collé.</em></p>
          </div>
          <div className="l-scroll-hint" aria-hidden="true"><span /></div>
        </div>
      </section>

      {/* 2 · ANATOMIE D'UNE SÉANCE */}
      <section id="methode" className="l-scene l-session" data-scene="session" data-steps="3" style={{ height: '320vh' }}>
        <div className="l-sticky">
          <div className="l-wrap">
            <p className="l-kicker">La méthode</p>
            <h2 className="l-h2">Anatomie d'une séance.</h2>
            <div className="l-session-chart">
              <svg viewBox="0 0 1000 170" preserveAspectRatio="none" role="img" aria-label="Profil d'une séance : 30 minutes d'échauffement, 6 fois 1000 mètres, 10 minutes de retour au calme">
                <line x1="0" y1="168" x2="1000" y2="168" stroke="rgba(255,255,255,.12)" />
                {bars.map((b, i) => <rect key={i} x={b.x} y={168 - b.h} width={Math.max(2, b.width)} height={b.h} rx="3" fill={b.c} className={b.label === 'warm' ? 'is-warm' : b.label === 'cool' ? 'is-cool' : 'is-work'} />)}
              </svg>
              <div className="l-session-mask" />
            </div>
            <div className="l-session-steps">
              {[
                ['30′', 'd\'échauffement en endurance. Toujours.', 'Le corps monte en température, sans allure imposée : aux sensations.'],
                ['6×1000', 'à ton allure exacte, au bip près.', 'Le corps de séance, calculé sur tes chronos. Jamais deux fois le même stimulus.'],
                ['10′', 'de retour au calme. Toujours.', 'On ne coupe pas net. On récupère pour la séance suivante.'],
              ].map(([n, t, d], i) => (
                <div key={i} className={`l-step ${sessionStep > i ? 'on' : ''}`}>
                  <div className="l-step-n">{n}</div>
                  <div><div className="l-step-t">{t}</div><div className="l-step-d">{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3 · ALLURES — expliquées simplement */}
      <section id="zones" className="l-scene l-zones" data-scene="zones" style={{ height: '200vh' }}>
        <div className="l-sticky">
          <div className="l-wrap l-zones-grid">
            <div>
              <p className="l-kicker">Tes allures</p>
              <h2 className="l-h2">Courir vite tout le temps ne fait pas progresser.</h2>
              <p className="l-body">Chaque séance vise un effort précis. C'est ce qui te fait avancer sans te cramer ni te blesser. Tes allures sont calculées sur tes chronos : entre ton temps sur 10 km pour voir.</p>
              <label className="l-slider">
                <span>Ton 10 km</span>
                <b className="num">{secsToPace(ten).replace(/^(\d+):(\d+)$/, (m, a, b) => `${a}'${b}`)}</b>
                <input type="range" min={30 * 60} max={70 * 60} step={15} value={ten} onChange={e => setTen(Number(e.target.value))} aria-label="Ton temps sur 10 km" />
              </label>
            </div>
            <div className="l-zone-list">
              {FAMILIES.map((f, i) => {
                const zs = zones.filter(z => f.zones.includes(z.id))
                const fast = zs[zs.length - 1].paceMax, slow = zs[0].paceMin
                return (
                  <div key={f.name} className="l-family" style={{ '--i': i, '--c': f.color }}>
                    <div className="l-family-top">
                      <b>{f.name}</b>
                      <span className={f.easy ? 'l-zone-pace easy' : 'l-zone-pace num'}>{f.easy ? 'aux sensations' : `${fast} – ${slow} /km`}</span>
                    </div>
                    <div className="l-family-why">{f.why}</div>
                  </div>
                )
              })}
              <div className="l-family-note">En coulisse : 14 zones précises, pour que ta montre bippe à la bonne allure. Toi, tu cours.</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 · BLOCS 3 + 1 */}
      <section className="l-scene l-blocks" data-scene="blocks" style={{ height: '180vh' }}>
        <div className="l-sticky">
          <div className="l-wrap">
            <p className="l-kicker">Périodisation</p>
            <h2 className="l-h2">Trois semaines de charbon.<br />Une pour assimiler.</h2>
            <div className="l-block-bars">
              {[62, 74, 86, 58].map((h, i) => (
                <div key={i} className={`l-block ${i === 3 ? 'rest' : ''}`} style={{ '--i': i, '--h': h }}>
                  <div className="l-block-fill"><span className="num">{Math.round(h * 0.9)} km</span></div>
                  <div className="l-block-label">{i === 3 ? 'Assimilation' : `Semaine ${i + 1}`}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4b · COACH VS APPLI */}
      <section className="l-versus">
        <div className="l-wrap">
          <p className="l-kicker">Pourquoi un coach</p>
          <h2 className="l-h2">Une appli te donne un plan.<br />Un coach te suit.</h2>
          <div className="l-vs-table">
            <div className="l-vs-head"><span /><span>Appli classique</span><span>Avec {BRAND.coach.split(' ')[0]}</span></div>
            {VERSUS.map(([topic, app, coach], i) => (
              <div key={i} className="l-vs-row reveal">
                <b>{topic}</b>
                <span className="l-vs-app">{app}</span>
                <span className="l-vs-coach">{coach}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 · L'APPLI */}
      <section id="appli" className="l-scene l-app" data-scene="app" data-steps="4" style={{ height: '260vh' }}>
        <div className="l-sticky">
          <div className="l-wrap l-app-grid">
            <div className="l-phone" aria-hidden="true">
              <div className="l-phone-screen">
                <div className="l-ph-top"><b>LANG<span>.</span></b><span className="num">J-42</span></div>
                <div className="l-ph-title">Au programme<br />aujourd'hui</div>
                <div className="l-ph-card">
                  <span className="pill" style={{ background: 'rgba(255,90,31,.15)', color: 'var(--accent)' }}>Seuil</span>
                  <div className="l-ph-name">2 × 14′ seuil</div>
                  <div className="l-ph-bar">{[18, 0, 70, 12, 70, 0, 14].map((h, i) => <i key={i} style={{ height: `${h + 20}%`, flex: [6, .2, 3, 1, 3, .2, 2][i], background: h > 40 ? '#ff5a1f' : '#55555d' }} />)}</div>
                  <div className="l-ph-rows">
                    <div><span>30′ EF</span><em>aux sensations</em></div>
                    <div><span>2 × 14′ Z8</span><em className="num">4'05–4'18</em></div>
                    <div><span>Retour au calme</span><em>10′ Z1</em></div>
                  </div>
                </div>
                <div className="l-ph-check">✓ Validée · RPE 7</div>
              </div>
            </div>
            <div>
              <p className="l-kicker">L'appli</p>
              <h2 className="l-h2">Ton coach dans ta poche.</h2>
              <ul className="l-features">
                {[
                  ['Ta séance du jour', 'Structure, allures et consignes du coach, au même endroit.'],
                  ['Sur ta montre', 'Export Garmin en un geste : les bips aux bonnes allures.'],
                  ['Ton ressenti compte', 'RPE, sensations, check-in forme : ton plan s\'adapte.'],
                  ['Un vrai échange', 'Le chat avec ton coach, séance par séance. Et Strava connecté.'],
                ].map(([t, d], i) => (
                  <li key={i} className={(steps.app ?? 0) > i ? 'on' : ''}><b>{t}</b><span>{d}</span></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 6 · LE COACH */}
      <section className="l-coach">
        <div className="l-wrap">
          <p className="l-kicker">Le coach</p>
          <h2 className="l-h2">{BRAND.coach}.</h2>
          <p className="l-body" style={{ maxWidth: 560 }}>Coureur sur route et trail, il entraîne des athlètes du premier 10 km au marathon. Il applique à ses athlètes ce qu'il s'impose à lui-même.</p>
          <div className="l-stats">
            {[["33'05", '10 km'], ["16'09", '5 km'], ["4'14", '1500 m'], ['3/3', 'podiums cet été']].map(([v, l]) => (
              <div key={l} className="l-stat reveal"><div className="num">{v}</div><span>{l}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* 7 · OFFRES & BOUTIQUE (s'affichent seulement si quelque chose est en vente) */}
      <section id="offres" className="l-shop">
        <div className="l-wrap">
          <CoachingOffers showToast={showToast} header={<><p className="l-kicker">Coaching</p><h2 className="l-h2">Choisis ton suivi.</h2><p className="l-body" style={{ marginBottom: 32 }}>Un plan seul, ou un coach à tes côtés chaque semaine. Ajoute les options qui te servent.</p></>} />
        </div>
      </section>
      <section id="boutique" className="l-shop">
        <div className="l-wrap">
          <Boutique showToast={showToast} header={<><p className="l-kicker">Boutique</p><h2 className="l-h2">Ce que j'utilise.</h2><p className="l-body" style={{ marginBottom: 28 }}>Gels, accessoires, récup : le matériel testé à l'entraînement et en course.</p></>} />
        </div>
      </section>

      {/* 8 · CONNEXION */}
      <section id="connexion" className="l-login">
        <div className="l-wrap">
          <h2 className="l-h2" style={{ textAlign: 'center' }}>On y va ?</h2>
          <p className="l-body" style={{ textAlign: 'center', margin: '0 auto 28px' }}>Tu es déjà suivi : entre ton code. Nouveau : crée ton compte.</p>
          <LoginPanel onAthleteLogin={onAthleteLogin} onCoachLogin={onCoachLogin} modeSignal={loginSignal} />
        </div>
        <footer className="l-foot"><Wordmark className="l-logo" /> <span>© {new Date().getFullYear()} {BRAND.coach}</span></footer>
      </section>
    </div>
  )
}
