import { useState, useEffect } from 'react'
import './index.css'
import { supabase } from './supabase'
import LoginScreen from './components/LoginScreen'
import CoachApp from './components/CoachApp'
import AthleteApp from './components/AthleteApp'

export default function App() {
  const [role, setRole] = useState(null) // null | 'coach' | 'athlete'
  const [currentAthlete, setCurrentAthlete] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  const handleLogin = async (code) => {
    const clean = code.trim().toUpperCase()
    if (clean === 'RAWRUN') {
      setRole('coach')
      return true
    }
    // Check athlete code in Supabase
    const { data, error } = await supabase
      .from('athletes')
      .select('*')
      .eq('code', clean)
      .single()
    if (data && !error) {
      setCurrentAthlete(data)
      setRole('athlete')
      return true
    }
    return false
  }

  const handleLogout = () => {
    setRole(null)
    setCurrentAthlete(null)
  }

  if (!role) return <LoginScreen onLogin={handleLogin} />

  return (
    <>
      {role === 'coach' && (
        <CoachApp onLogout={handleLogout} showToast={showToast} />
      )}
      {role === 'athlete' && (
        <AthleteApp athlete={currentAthlete} onLogout={handleLogout} showToast={showToast} />
      )}
      {toast && (
        <div className={`toast ${toast.type === 'err' ? 'err' : ''}`}>{toast.msg}</div>
      )}
    </>
  )
}
