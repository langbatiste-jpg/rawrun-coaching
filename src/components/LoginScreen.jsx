import { useState } from 'react'

export default function LoginScreen({ onLogin }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    const ok = await onLogin(code)
    if (!ok) {
      setError('Code inconnu. Contacte ton coach.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: 20, background: '#080d16'
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 56, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>RAW</span>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 56, fontWeight: 800, letterSpacing: '-0.04em', color: '#e11d48' }}>RUN</span>
      </div>
      <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.18em', marginBottom: 52 }}>COACHING PLATFORM</div>

      <div className="card" style={{ width: '100%', maxWidth: 360, padding: 32 }}>
        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 22 }}>Connexion</div>
        <input
          className="input"
          placeholder="Code d'accès"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={{ marginBottom: 10, fontSize: 15, letterSpacing: '0.08em' }}
          autoFocus
        />
        {error && <div style={{ color: '#e11d48', fontSize: 12, marginBottom: 10 }}>{error}</div>}
        <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{ width: '100%', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Vérification…' : 'Entrer →'}
        </button>
        <div style={{ marginTop: 22, fontSize: 11, color: '#334155', textAlign: 'center', lineHeight: 2 }}>
          Coach : <b style={{ color: '#64748b' }}>RAWRUN</b><br />
          Athlète : ton code perso
        </div>
      </div>
    </div>
  )
}
