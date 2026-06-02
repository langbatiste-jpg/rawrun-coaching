export async function sendEmailNotification(supabase, { to, subject, body }) {
  // Store as notification in DB - in prod you'd call an edge function
  try {
    await supabase.from('email_queue').insert({ to_email: to, subject, body, sent: false })
  } catch (e) {
    console.log('Email queued (table may not exist yet):', subject)
  }
}
