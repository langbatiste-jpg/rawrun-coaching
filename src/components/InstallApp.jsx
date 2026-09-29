import { useState, useEffect } from 'react'
import { BRAND } from '../../shared/brand.js'

// Carte « Installer l'appli » : bouton natif sur Android/Chrome, mode d'emploi sur iPhone
export default function InstallApp() {
  const [prompt, setPrompt] = useState(() => window.__rrInstall || null)
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone)
  useEffect(() => {
    const ready = () => setPrompt(window.__rrInstall)
    const done = () => setInstalled(true)
    window.addEventListener('rr-install-ready', ready)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('rr-install-ready', ready); window.removeEventListener('appinstalled', done) }
  }, [])
  if (installed) return null
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return (
    <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <img src="/icons/icon-192.png" alt="" width="48" height="48" style={{ borderRadius: 12 }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <b>Installer l'appli {BRAND.name}</b>
        <div className="muted" style={{ fontSize: 13 }}>
          {ios ? <>Dans Safari : touche <b>Partager</b> ⬆︎ puis <b>« Sur l'écran d'accueil »</b>.</> : 'Une icône sur ton écran d\'accueil, en plein écran, comme une vraie appli.'}
        </div>
      </div>
      {prompt && <button className="btn-primary" onClick={async () => { prompt.prompt(); await prompt.userChoice; window.__rrInstall = null; setPrompt(null) }}>Installer</button>}
    </div>
  )
}
