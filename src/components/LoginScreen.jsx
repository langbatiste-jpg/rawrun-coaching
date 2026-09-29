import { useState } from 'react'

const COACHES = [
  { id: 'batlarun', name: 'Batlarun', emoji: '🏃', desc: "Coureur aguerri — à 3'20 il est en footing" },
  { id: 'batlaro', name: 'Batlaro', emoji: '📸', desc: 'Instagrameur — il essaye de faire des dumps' },
  { id: 'batiste', name: 'Batiste', emoji: '💼', desc: 'Partenariats et développement commercial chez RAWRUN' },
]

export default function LoginScreen({ onAthleteLogin, onCoachLogin }) {
  const [mode, setMode] = useState('code') // code | email | register
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const [cred, setCred] = useState({ email: '', password: '' })
  const [reg, setReg] = useState({ step: 1, coach: null, name: '', email: '', password: '' })
  const [coachOpen, setCoachOpen] = useState(false)
  const [coachCred, setCoachCred] = useState({ email: '', password: '' })

  const run = async fn => {
    setLoading(true); setError('')
    try { await fn() } catch (e) { setError(e.message) }
    setLoading(false)
  }
  const switchMode = m => { setMode(m); setError('') }
  const onEnter = fn => e => e.key === 'Enter' && fn()

  const submitCode = () => code.trim() && run(() => onAthleteLogin({ action: 'code', code }))
  const submitEmail = () => run(() => onAthleteLogin({ action: 'login', ...cred }))
  const submitRegister = () => run(() => onAthleteLogin({ action: 'register', name: reg.name, email: reg.email, password: reg.password, coachId: reg.coach }))
  const submitCoach = () => run(() => onCoachLogin(coachCred.email, coachCred.password))

  return (
    <div className="login-wrap">
      <style>{`
        .login-wrap { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: 1.15fr 1fr; align-items: center; gap: 40px; padding: 40px clamp(20px, 5vw, 72px); }
        .login-hero h1 { font-family: var(--display); font-size: clamp(88px, 15vw, 220px); line-height: .82; letter-spacing: .01em; color: #fff; animation: heroIn 1s var(--ease) both; }
        .login-hero h1 span { display: block; color: transparent; -webkit-text-stroke: 1.5px var(--accent); }
        .login-hero p { font-size: 17px; color: var(--text-2); max-width: 30ch; margin-top: 22px; animation: heroIn 1s .15s var(--ease) both; }
        .login-card { width: 100%; max-width: 420px; justify-self: center; animation: heroIn .9s .25s var(--ease) both; }
        .login-card .card { padding: 24px; }
        .coach-pick { display: grid; gap: 8px; }
        .coach-opt { display: flex; gap: 12px; align-items: center; text-align: left; padding: 12px; border-radius: 12px; border: 1px solid var(--border-2); background: rgba(0,0,0,.25); color: var(--text); cursor: pointer; transition: all .15s; }
        .coach-opt:hover { border-color: rgba(255,255,255,.3); }
        .coach-opt.on { border-color: var(--accent); background: var(--accent-glow); }
        .coach-opt .em { font-size: 26px; }
        .coach-door { position: fixed; right: 14px; bottom: calc(12px + var(--safe-b)); background: none; border: none; color: var(--text-4); cursor: pointer; font-size: 18px; letter-spacing: 2px; padding: 8px; opacity: .5; }
        .coach-door:hover { opacity: 1; color: var(--text-2); }
        @keyframes heroIn { from { opacity: 0; transform: translateY(24px); } }
        @media (max-width: 860px) {
          .login-wrap { grid-template-columns: 1fr; gap: 28px; padding: calc(40px + env(safe-area-inset-top,0px)) 18px 40px; align-content: start; }
          .login-hero p { font-size: 15px; margin-top: 14px; }
        }
      `}</style>

      <div className="login-hero">
        <h1>RAW<span>RUN</span></h1>
        <p>Ton plan, tes allures, ton coach. Tout ce qu'il faut pour courir plus vite, au même endroit.</p>
      </div>

      <div className="login-card">
        <div className="card">
          <div className="tab-bar" style={{ display: 'flex', marginBottom: 22 }}>
            {[['code', 'Code'], ['email', 'Email'], ['register', 'Créer un compte']].map(([m, l]) => (
              <button key={m} className={`tab-btn ${mode === m ? 'active' : ''}`} style={{ flex: 1 }} onClick={() => switchMode(m)}>{l}</button>
            ))}
          </div>

          {mode === 'code' && (
            <div className="fg" style={{ gap: 12 }}>
              <label className="fg-label" htmlFor="code">Ton code d'accès (envoyé par ton coach)</label>
              <input id="code" className="input num" style={{ fontSize: 18, letterSpacing: '.12em', textTransform: 'uppercase' }} placeholder="YOANN23" value={code} onChange={e => setCode(e.target.value)} onKeyDown={onEnter(submitCode)} autoFocus autoCapitalize="characters" autoComplete="off" />
              {error && <div className="err-msg">{error}</div>}
              <button className="btn-primary" onClick={submitCode} disabled={loading}>{loading ? 'Vérification…' : 'Se connecter'}</button>
            </div>
          )}

          {mode === 'email' && (
            <div className="fg" style={{ gap: 12 }}>
              <input className="input" type="email" placeholder="ton@email.com" autoComplete="email" value={cred.email} onChange={e => setCred(c => ({ ...c, email: e.target.value }))} />
              <input className="input" type="password" placeholder="Mot de passe" autoComplete="current-password" value={cred.password} onChange={e => setCred(c => ({ ...c, password: e.target.value }))} onKeyDown={onEnter(submitEmail)} />
              {error && <div className="err-msg">{error}</div>}
              <button className="btn-primary" onClick={submitEmail} disabled={loading}>{loading ? 'Vérification…' : 'Se connecter'}</button>
            </div>
          )}

          {mode === 'register' && reg.step === 1 && (
            <div className="fg" style={{ gap: 12 }}>
              <div style={{ fontWeight: 600 }}>Choisis ton coach</div>
              <div className="coach-pick">
                {COACHES.map(c => (
                  <button key={c.id} className={`coach-opt ${reg.coach === c.id ? 'on' : ''}`} onClick={() => setReg(r => ({ ...r, coach: c.id }))}>
                    <span className="em">{c.emoji}</span>
                    <span><b>{c.name}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>{c.desc}</span></span>
                  </button>
                ))}
              </div>
              <button className="btn-primary" disabled={!reg.coach} onClick={() => setReg(r => ({ ...r, step: 2 }))}>Continuer</button>
            </div>
          )}

          {mode === 'register' && reg.step === 2 && (
            <div className="fg" style={{ gap: 12 }}>
              <button className="btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setReg(r => ({ ...r, step: 1 }))}>← Coach : {COACHES.find(c => c.id === reg.coach)?.name}</button>
              <input className="input" placeholder="Prénom Nom" autoComplete="name" value={reg.name} onChange={e => setReg(r => ({ ...r, name: e.target.value }))} />
              <input className="input" type="email" placeholder="ton@email.com" autoComplete="email" value={reg.email} onChange={e => setReg(r => ({ ...r, email: e.target.value }))} />
              <input className="input" type="password" placeholder="Mot de passe (6 caractères min.)" autoComplete="new-password" value={reg.password} onChange={e => setReg(r => ({ ...r, password: e.target.value }))} onKeyDown={onEnter(submitRegister)} />
              {error && <div className="err-msg">{error}</div>}
              <button className="btn-primary" onClick={submitRegister} disabled={loading}>{loading ? 'Création…' : 'Créer mon compte'}</button>
            </div>
          )}
        </div>
      </div>

      <button className="coach-door" aria-label="Accès coach" onClick={() => { setCoachOpen(true); setError('') }}>···</button>

      {coachOpen && (
        <div className="overlay" onClick={() => setCoachOpen(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title">Accès coach</div>
            <div className="fg" style={{ gap: 12 }}>
              <input className="input" type="email" placeholder="Email coach" autoComplete="username" value={coachCred.email} onChange={e => setCoachCred(c => ({ ...c, email: e.target.value }))} autoFocus />
              <input className="input" type="password" placeholder="Mot de passe" autoComplete="current-password" value={coachCred.password} onChange={e => setCoachCred(c => ({ ...c, password: e.target.value }))} onKeyDown={onEnter(submitCoach)} />
              {error && <div className="err-msg">{error}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-ghost" onClick={() => setCoachOpen(false)}>Annuler</button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={submitCoach} disabled={loading}>{loading ? '…' : 'Entrer'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
