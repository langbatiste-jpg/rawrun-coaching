import { useState } from 'react'

const COACHES = [
  {
    id: 'batlarun',
    name: 'Batlarun',
    desc: 'Coureur aguerri — à 3\'20 il est en footing',
    photo: '/coaches/batlarun.jpg',
    emoji: '🏃'
  },
  {
    id: 'batlaro',
    name: 'Batlaro',
    desc: 'Instagrameur — il essaye de faire des dumps',
    photo: '/coaches/batlaro.jpg',
    emoji: '📸'
  },
  {
    id: 'batiste',
    name: 'Batiste',
    desc: 'Chargé de partenariats et du développement commercial chez RAWRUN',
    photo: '/coaches/batiste.jpg',
    emoji: '💼'
  }
]

export default function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('login') // login | register | coach-login
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCoachLogin, setShowCoachLogin] = useState(false)
  const [coachCode, setCoachCode] = useState('')

  // Register state
  const [regStep, setRegStep] = useState(1) // 1=coach choice, 2=form
  const [selectedCoach, setSelectedCoach] = useState(null)
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '' })

  const handleAthleteLogin = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    const ok = await onLogin(code)
    if (!ok) setError('Code inconnu. Contacte ton coach.')
    setLoading(false)
  }

  const handleCoachLogin = async () => {
    if (coachCode.trim().toUpperCase() === 'RAWRUN') {
      setLoading(true)
      await onLogin('RAWRUN')
      setLoading(false)
    } else {
      setError('Code coach incorrect.')
    }
  }

  const handleRegister = async () => {
    if (!regForm.name || !regForm.email || !regForm.password) return setError('Remplis tous les champs')
    setLoading(true)
    setError('')
    const ok = await onLogin(null, { ...regForm, coachId: selectedCoach.id, isRegister: true })
    if (!ok) setError('Erreur lors de la création du compte.')
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 20, background: '#080d16' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        .login-input { background: #0a0f1a; border: 1px solid #1e293b; color: #e2e8f0; border-radius: 8px; padding: 10px 14px; font-family: 'DM Mono', monospace; font-size: 13px; width: 100%; outline: none; transition: border 0.12s; }
        .login-input:focus { border-color: #e11d48; }
        .btn-red { background: #e11d48; color: #fff; border: none; cursor: pointer; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 13px; padding: 11px 20px; font-weight: 500; transition: all 0.12s; width: 100%; }
        .btn-red:hover { background: #be123c; }
        .btn-outline { background: transparent; border: 1px solid #1e293b; color: #94a3b8; cursor: pointer; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 12px; padding: 9px 16px; transition: all 0.12s; }
        .btn-outline:hover { border-color: #334155; color: #e2e8f0; }
        .coach-card { background: #111827; border: 2px solid #1e293b; border-radius: 12px; padding: 16px; cursor: pointer; transition: all 0.15s; text-align: center; }
        .coach-card:hover { border-color: #e11d48; transform: translateY(-2px); }
        .coach-card.selected { border-color: #e11d48; background: #1a0a10; }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 52, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>RAW</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 52, fontWeight: 800, letterSpacing: '-0.04em', color: '#e11d48' }}>RUN</span>
      </div>
      <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.18em', marginBottom: 40 }}>COACHING PLATFORM</div>

      {/* Coach login modal */}
      {showCoachLogin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, width: '100%', maxWidth: 360 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Accès Coach</div>
            <input className="login-input" type="password" placeholder="Code coach" value={coachCode} onChange={e => setCoachCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCoachLogin()} style={{ marginBottom: 10 }} autoFocus />
            {error && <div style={{ color: '#e11d48', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-outline" onClick={() => { setShowCoachLogin(false); setError('') }}>Annuler</button>
              <button className="btn-red" onClick={handleCoachLogin} disabled={loading}>{loading ? '…' : 'Entrer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Main card */}
      <div style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 16, padding: 28, width: '100%', maxWidth: mode === 'register' && regStep === 1 ? 760 : 380 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#0a0f1a', borderRadius: 8, padding: 4 }}>
          <button onClick={() => { setMode('login'); setError('') }} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 12, background: mode === 'login' ? '#1e293b' : 'transparent', color: mode === 'login' ? '#fff' : '#64748b', transition: 'all 0.12s' }}>
            Connexion
          </button>
          <button onClick={() => { setMode('register'); setRegStep(1); setError('') }} style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Mono'", fontSize: 12, background: mode === 'register' ? '#1e293b' : 'transparent', color: mode === 'register' ? '#fff' : '#64748b', transition: 'all 0.12s' }}>
            Créer un compte
          </button>
        </div>

        {mode === 'login' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>TON CODE D'ACCÈS</div>
            <input className="login-input" placeholder="ex: YOANN23" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAthleteLogin()} autoFocus />
            {error && <div style={{ color: '#e11d48', fontSize: 12 }}>{error}</div>}
            <button className="btn-red" onClick={handleAthleteLogin} disabled={loading}>{loading ? 'Vérification…' : 'Se connecter →'}</button>
            <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', marginTop: 4 }}>
              Ton code t'a été envoyé par ton coach
            </div>
          </div>
        )}

        {mode === 'register' && regStep === 1 && (
          <div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Choisis ton coach</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Il suivra ton entraînement et programmera tes séances.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
              {COACHES.map(c => (
                <div key={c.id} className={`coach-card ${selectedCoach?.id === c.id ? 'selected' : ''}`} onClick={() => setSelectedCoach(c)}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>{c.emoji}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>{c.desc}</div>
                  {selectedCoach?.id === c.id && <div style={{ marginTop: 10, fontSize: 11, color: '#e11d48', fontWeight: 600 }}>✓ Sélectionné</div>}
                </div>
              ))}
            </div>
            <button className="btn-red" onClick={() => { if (!selectedCoach) return setError('Choisis un coach !'); setError(''); setRegStep(2) }} disabled={!selectedCoach}>
              Continuer →
            </button>
            {error && <div style={{ color: '#e11d48', fontSize: 12, marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {mode === 'register' && regStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button className="btn-outline" style={{ padding: '6px 12px', fontSize: 11 }} onClick={() => setRegStep(1)}>← Retour</button>
              <div style={{ fontSize: 12, color: '#64748b' }}>Coach : <b style={{ color: '#e11d48' }}>{selectedCoach?.name}</b></div>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>TON PRÉNOM / NOM</div>
            <input className="login-input" placeholder="Prénom Nom" value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} />
            <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>EMAIL</div>
            <input className="login-input" type="email" placeholder="ton@email.com" value={regForm.email} onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} />
            <div style={{ fontSize: 10, color: '#64748b', letterSpacing: '0.08em' }}>MOT DE PASSE</div>
            <input className="login-input" type="password" placeholder="••••••••" value={regForm.password} onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} />
            {error && <div style={{ color: '#e11d48', fontSize: 12 }}>{error}</div>}
            <button className="btn-red" onClick={handleRegister} disabled={loading}>{loading ? 'Création…' : 'Créer mon compte →'}</button>
          </div>
        )}
      </div>

      {/* Coach access - discreet button at bottom */}
      <div style={{ position: 'fixed', bottom: 16, right: 16 }}>
        <button onClick={() => { setShowCoachLogin(true); setError('') }}
          style={{ background: 'none', border: 'none', color: '#1e293b', cursor: 'pointer', fontSize: 10, fontFamily: "'DM Mono'", letterSpacing: '0.05em' }}>
          ···
        </button>
      </div>
    </div>
  )
}
