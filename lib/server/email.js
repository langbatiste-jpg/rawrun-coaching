// Envoi d'e-mails via Resend — la clé reste sur le serveur (variable RESEND_API_KEY sur Vercel)
import { escapeHtml } from './core.js'

const SITE = process.env.SITE_URL || 'https://rawrun-coaching.vercel.app'

export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('RESEND_API_KEY absente — e-mail non envoyé:', subject); return { skipped: true } }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'RAWRUN Coaching <onboarding@resend.dev>', to, subject, html }),
  })
  if (!res.ok) console.error('Resend', res.status, await res.text())
  return { ok: res.ok }
}

export function layout({ kicker, title, body, accent = '#ff5a1f' }) {
  return `<div style="background:#07070a;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#f4f4f5">
  <div style="max-width:560px;margin:0 auto">
    <div style="font-size:30px;font-weight:900;letter-spacing:1px">RAW<span style="color:#ff5a1f">RUN</span></div>
    <div style="color:#71717a;font-size:11px;letter-spacing:3px;margin:2px 0 24px">COACHING</div>
    <div style="background:#131316;border-radius:14px;padding:22px;border-left:3px solid ${accent}">
      <div style="font-size:11px;color:#a1a1aa;letter-spacing:2px;margin-bottom:6px">${escapeHtml(kicker)}</div>
      <div style="font-size:19px;font-weight:700;margin-bottom:10px">${escapeHtml(title)}</div>
      <div style="font-size:14px;line-height:1.6;color:#d4d4d8;white-space:pre-wrap">${body}</div>
    </div>
    <a href="${SITE}" style="display:inline-block;margin-top:18px;background:#ff5a1f;color:#07070a;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px;font-size:13px">Ouvrir RAWRUN →</a>
  </div></div>`
}
