import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/space-grotesk/latin-400.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/space-mono/latin-400.css'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Appli installable (PWA) : on enregistre le service worker en production
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
// Garde l'invite d'installation Android/Chrome pour le bouton « Installer l'appli »
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__rrInstall = e; window.dispatchEvent(new Event('rr-install-ready')) })
