// Appel à l'API Claude (Anthropic) avec sortie structurée forcée via un "outil".
import { HttpError } from './core.js'

export const MODEL = () => process.env.AI_MODEL || 'claude-sonnet-5-5'

export async function callClaude({ system, prompt, tool, maxTokens = 8000 }) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new HttpError(500, "ANTHROPIC_API_KEY non configurée sur Vercel — l'IA est désactivée.")
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`
    if (res.status === 401) throw new HttpError(500, 'Clé API Anthropic invalide')
    if (res.status === 400 && /credit|balance/i.test(msg)) throw new HttpError(402, 'Crédit Anthropic épuisé — recharge ton compte sur console.anthropic.com')
    if (res.status === 429 || res.status === 529) throw new HttpError(503, "L'IA est surchargée, réessaie dans une minute")
    throw new HttpError(502, `Erreur IA : ${msg}`)
  }
  const block = (data.content || []).find(c => c.type === 'tool_use')
  if (!block?.input) throw new HttpError(502, "L'IA n'a pas renvoyé de résultat exploitable, réessaie")
  if (data.stop_reason === 'max_tokens') throw new HttpError(502, 'Réponse IA trop longue, réduis le nombre de semaines par lot')
  return block.input
}

// ── Schémas JSON ──
const STEP = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['step'] },
    name: { type: 'string', description: 'Ex: Échauffement, Corps, Récup, Retour au calme' },
    zone: { type: 'integer', minimum: 1, maximum: 14 },
    duration_s: { type: 'integer', description: 'Durée en secondes (utiliser OU distance_m)' },
    distance_m: { type: 'integer', description: 'Distance en mètres (utiliser OU duration_s)' },
    lap: { type: 'boolean', description: 'true = passage au bloc suivant avec le bouton LAP' },
  },
  required: ['type', 'zone'],
}
const REPEAT = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['repeat'] },
    name: { type: 'string' },
    reps: { type: 'integer', minimum: 1, maximum: 60 },
    steps: { type: 'array', items: STEP, minItems: 1 },
  },
  required: ['type', 'reps', 'steps'],
}
export const STEPS_SCHEMA = { type: 'array', items: { anyOf: [STEP, REPEAT] } }

export const SESSION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nom court et parlant, ex: "3×3 km AS21 – récup 2′"' },
    session_type: { type: 'string', enum: ['EF', 'SEUIL', 'VMA', 'FARTLEK', 'COTES', 'SORTIE', 'PISTE', 'RECUP', 'COMP', 'CROSS', 'RENFO'] },
    description: { type: 'string', description: "Objectif physiologique + consignes d'exécution (2-4 phrases, tutoiement)" },
    steps: STEPS_SCHEMA,
  },
  required: ['name', 'session_type', 'description', 'steps'],
}
