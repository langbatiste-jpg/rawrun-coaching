import { supabase } from './supabase'

// Appelle une fonction serveur (/api/…). En mode coach, joint le jeton de connexion.
export async function api(path, body = {}, { coach = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (coach) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }
  let res
  try {
    res = await fetch(`/api/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch {
    throw new Error('Pas de connexion internet')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 404 && !data.error) throw new Error('Fonction serveur introuvable (en local, lance « vercel dev » au lieu de « npm run dev »)')
    throw new Error(data.error || `Erreur ${res.status}`)
  }
  return data
}
