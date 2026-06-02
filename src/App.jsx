import { useState, useEffect } from 'react'
import './index.css'
import { supabase } from './supabase'
import LoginScreen from './components/LoginScreen'
import CoachApp from './components/CoachApp'
import AthleteApp from './components/AthleteApp'

export default function App() {
  const [role, setRole] = useState(null)
  const [currentAthlete, setCurrentAthlete] = useState(null)
  const [toast, setToast] = useState(null)

  // Persist session
  useEffect(() => {
    const saved = localStorage.getItem('rr_session')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.role === 'coach') setRole('coach')
        else if (s.role === 'athlete' && s.athlete) { setRole('athlete'); setCurrentAthlete(s.athlete) }
      } catch {}
    }
  }, [])

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  const handleLogin = async (code, registerData = null) => {
    // Registration flow
    if (registerData?.isRegister) {
      // Check if email already exists
      const { data: existing } = await supabase.from('athlete_accounts').select('id').eq('email', registerData.email).single()
      if (existing) return false

      // Create athlete profile
      const { data: newAthlete, error: athleteErr } = await supabase.from('athletes').insert({
        name: registerData.name,
        code: registerData.name.toUpperCase().replace(/\s+/g, '').slice(0, 8) + Math.floor(Math.random() * 99),
        goal: '',
      }).select().single()

      if (athleteErr || !newAthlete) return false

      // Create account
      const { error: accountErr } = await supabase.from('athlete_accounts').insert({
        athlete_id: newAthlete.id,
        email: registerData.email,
        password_hash: btoa(registerData.password), // Simple encoding for MVP - use bcrypt in prod
        coach_id: registerData.coachId,
      })

      if (accountErr) return false

      setCurrentAthlete(newAthlete)
      setRole('athlete')
      localStorage.setItem('rr_session', JSON.stringify({ role: 'athlete', athlete: newAthlete }))
      return true
    }

    const clean = code?.trim().toUpperCase()

    // Coach login
    if (clean === 'RAWRUN') {
      setRole('coach')
      localStorage.setItem('rr_session', JSON.stringify({ role: 'coach' }))
      return true
    }

    // Try athlete code
    const { data: byCode } = await supabase.from('athletes').select('*').eq('code', clean).single()
    if (byCode) {
      setCurrentAthlete(byCode)
      setRole('athlete')
      localStorage.setItem('rr_session', JSON.stringify({ role: 'athlete', athlete: byCode }))
      return true
    }

    // Try email/password
    const { data: account } = await supabase.from('athlete_accounts').select('*, athletes(*)').eq('email', clean).single()
    if (account) {
      setCurrentAthlete(account.athletes)
      setRole('athlete')
      localStorage.setItem('rr_session', JSON.stringify({ role: 'athlete', athlete: account.athletes }))
      return true
    }

    return false
  }

  const handleLogout = () => {
    setRole(null)
    setCurrentAthlete(null)
    localStorage.removeItem('rr_session')
  }

  return (
    <>
      {!role && <LoginScreen onLogin={handleLogin} />}
      {role === 'coach' && <CoachApp onLogout={handleLogout} showToast={showToast} />}
      {role === 'athlete' && <AthleteApp athlete={currentAthlete} onLogout={handleLogout} showToast={showToast} />}
      {toast && <div className={`toast ${toast.type === 'err' ? 'err' : ''}`}>{toast.msg}</div>}
    </>
  )
}
