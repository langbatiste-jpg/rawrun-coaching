const RESEND_API_KEY = 're_PTDWVuYU_FsQQC6uVm2UoJRBZsXRPY96t'
const FROM = 'RAWRUN Coaching <onboarding@resend.dev>'

export async function sendEmail({ to, subject, html }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM, to, subject, html })
    })
    const data = await res.json()
    return data
  } catch (e) {
    console.error('Email error:', e)
    return null
  }
}

export function emailSessionReminder(athleteName, sessionName, sessionDate) {
  return {
    subject: `🏃 Séance demain : ${sessionName}`,
    html: `
      <div style="font-family:monospace;background:#080d16;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto">
        <div style="font-size:28px;font-weight:900;margin-bottom:4px">RAW<span style="color:#e11d48">RUN</span></div>
        <div style="color:#64748b;font-size:12px;margin-bottom:28px;letter-spacing:0.1em">COACHING PLATFORM</div>
        <div style="background:#111827;border-radius:12px;padding:20px;margin-bottom:16px;border-left:3px solid #e11d48">
          <div style="font-size:11px;color:#64748b;margin-bottom:4px;letter-spacing:0.08em">SÉANCE DE DEMAIN</div>
          <div style="font-size:20px;font-weight:700">${sessionName}</div>
          <div style="color:#64748b;margin-top:4px">${sessionDate}</div>
        </div>
        <div style="font-size:13px;color:#64748b">Connecte-toi sur <a href="https://rawrun-coaching.vercel.app" style="color:#e11d48">rawrun-coaching.vercel.app</a> pour voir le détail complet.</div>
      </div>
    `
  }
}

export function emailNewMessage(fromName, sessionName, messageText) {
  return {
    subject: `💬 Nouveau message de ${fromName}`,
    html: `
      <div style="font-family:monospace;background:#080d16;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto">
        <div style="font-size:28px;font-weight:900;margin-bottom:28px">RAW<span style="color:#e11d48">RUN</span></div>
        <div style="background:#111827;border-radius:12px;padding:20px">
          <div style="color:#64748b;font-size:12px;margin-bottom:8px">${fromName} — ${sessionName}</div>
          <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${messageText}</div>
        </div>
        <div style="margin-top:16px;font-size:12px;color:#64748b">Réponds sur <a href="https://rawrun-coaching.vercel.app" style="color:#e11d48">rawrun-coaching.vercel.app</a></div>
      </div>
    `
  }
}

export function emailSessionCompleted(athleteName, sessionName, rpe, sensations) {
  return {
    subject: `✅ ${athleteName} a validé sa séance`,
    html: `
      <div style="font-family:monospace;background:#080d16;color:#e2e8f0;padding:32px;max-width:600px;margin:0 auto">
        <div style="font-size:28px;font-weight:900;margin-bottom:28px">RAW<span style="color:#e11d48">RUN</span></div>
        <div style="background:#111827;border-radius:12px;padding:20px;border-left:3px solid #4ade80">
          <div style="font-size:16px;font-weight:700;margin-bottom:8px">✅ ${athleteName} a terminé : ${sessionName}</div>
          <div style="color:#e11d48;font-size:14px;margin-bottom:8px">RPE : ${rpe}/10</div>
          ${sensations ? `<div style="color:#94a3b8;font-size:13px;line-height:1.6">"${sensations}"</div>` : ''}
        </div>
        <div style="margin-top:16px;font-size:12px;color:#64748b">Réponds sur <a href="https://rawrun-coaching.vercel.app" style="color:#e11d48">rawrun-coaching.vercel.app</a></div>
      </div>
    `
  }
}
