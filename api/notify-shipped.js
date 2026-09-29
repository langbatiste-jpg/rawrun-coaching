// POST /api/notify-shipped { order_id } — le coach a expédié : on prévient le client par e-mail.
import { handler, HttpError, requireCoach, escapeHtml } from '../lib/server/core.js'
import { sendEmail, layout } from '../lib/server/email.js'

export default handler(async ({ req, body }) => {
  const { db } = await requireCoach(req)
  const { data: o } = await db.from('orders').select('*').eq('id', body.order_id || '').maybeSingle()
  if (!o) throw new HttpError(404, 'Commande introuvable')
  if (!o.email) return { skipped: 'pas d\'e-mail client' }
  const list = (o.items || []).map(i => `• ${escapeHtml(i.name)}${i.qty ? ` × ${i.qty}` : ''}`).join('\n')
  const track = o.tracking ? `\n\nNuméro de suivi : <b>${escapeHtml(o.tracking)}</b>\nSuivre le colis : <a href="https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(o.tracking)}" style="color:#ff5a1f">laposte.fr</a>` : ''
  return sendEmail({
    to: o.email,
    subject: `📦 Ta commande ${o.order_no || ''} est partie !`,
    html: layout({ kicker: 'COLIS EXPÉDIÉ', accent: '#c8ff2e', title: `C'est parti ${escapeHtml(String(o.name || '').split(' ')[0])} !`, body: `${list}${track}\n\nBonne séance 🏃` }),
  })
})
