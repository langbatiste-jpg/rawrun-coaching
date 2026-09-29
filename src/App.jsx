import { useState, useEffect } from 'react'
import './index.css'
import { supabase } from './supabase'
import { api } from './api'
import Landing from './components/Landing'
import CoachApp from './components/CoachApp'
import AthleteApp from './components/AthleteApp'
import AnimatedBackground from './components/AnimatedBackground'

export default function App() {
  const [role, setRole] = useState(null)          // null | 'coach' | 'athlete'
  const [currentAthlete, setCurrentAthlete] = useState(null)
  const [ready, setReady] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    // 1. Coach : session Supabase Auth
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setRole('coach')
      else {
        // 2. Athlète : profil gardé sur l'appareil
        try {
          const s = JSON.parse(localStorage.getItem('rr_session') || 'null')
          if (s?.role === 'athlete' && s.athlete?.id) { setCurrentAthlete(s.athlete); setRole('athlete') }
        } catch {}
      }
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setRole(r => (r === 'coach' ? null : r))
      if (event === 'SIGNED_IN' && session) setRole('coach')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { window.scrollTo(0, 0) }, [role])

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    clearTimeout(window.__rrToast)
    window.__rrToast = setTimeout(() => setToast(null), 3000)
  }

  // Connexion athlète : vérifiée côté serveur
  const loginAthlete = async payload => {
    const { athlete } = await api('athlete-auth', payload)
    setCurrentAthlete(athlete)
    setRole('athlete')
    localStorage.setItem('rr_session', JSON.stringify({ role: 'athlete', athlete }))
  }

  // Connexion coach : Supabase Auth (email + mot de passe)
  const loginCoach = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message.includes('Invalid') ? 'Email ou mot de passe incorrect' : error.message)
    localStorage.removeItem('rr_session')
    setRole('coach')
  }

  const handleLogout = async () => {
    if (role === 'coach') await supabase.auth.signOut()
    setRole(null)
    setCurrentAthlete(null)
    localStorage.removeItem('rr_session')
  }

  const updateAthlete = a => {
    setCurrentAthlete(a)
    localStorage.setItem('rr_session', JSON.stringify({ role: 'athlete', athlete: a }))
  }

  return (
    <>
      <AnimatedBackground calm={!!role} />
      <div className="rr-app">
        {ready && !role && <Landing onAthleteLogin={loginAthlete} onCoachLogin={loginCoach} showToast={showToast} />}
        {role === 'coach' && <CoachApp onLogout={handleLogout} showToast={showToast} />}
        {role === 'athlete' && currentAthlete && <AthleteApp athlete={currentAthlete} onAthleteUpdate={updateAthlete} onLogout={handleLogout} showToast={showToast} />}
      </div>
      {toast && <div className={`toast ${toast.type === 'err' ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </>
  )
}
