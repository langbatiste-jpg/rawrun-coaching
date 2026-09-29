// Service worker RAWRUN : l'appli s'ouvre même hors connexion (dernière version en cache).
const CACHE = 'rawrun-v7'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  // Jamais de cache pour les données (Supabase, API, Strava…)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // Pages : réseau d'abord, cache si hors ligne
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/index.html', copy)); return r }).catch(() => caches.match('/index.html')))
    return
  }
  // Fichiers (JS, CSS, icônes) : cache d'abord, mis à jour en arrière-plan
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return r }).catch(() => hit)
    return hit || net
  }))
})
