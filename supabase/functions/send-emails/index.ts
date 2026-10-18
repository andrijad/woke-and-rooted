// Edge funkcija: šalje mejlove iz reda public.email_outbox preko Resend-a.
// Poziva je pg_cron (svakog minuta, samo kad ima mejlova u redu) sa zaglavljem x-cron-secret.
// Secrets (Supabase → Edge Functions → Secrets): RESEND_API_KEY, CRON_SECRET.
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY Supabase daje automatski.
import { createClient } from 'npm:@supabase/supabase-js@2'

const FROM = 'Woke & Rooted <noreply@wokeandrooted.com>'
const APP_URL = 'https://prijave.wokeandrooted.com'
const SITE_URL = 'https://wokeandrooted.com'
const INSTAGRAM_URL = 'https://www.instagram.com/woke.and.rooted'

type Payload = Record<string, unknown>
type Rendered = { subject: string; html: string; text: string }

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ---------- zajednički izgled (isti kao šabloni u supabase/email-templates) ----------
function layout(content: string): string {
  return `<!doctype html>
<html lang="sr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Woke &amp; Rooted</title></head>
<body style="margin:0;padding:0;background:#f2e8cc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2e8cc;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf7ea;border-radius:8px;">
      <tr><td align="center" style="padding:28px 24px 8px;">
        <img src="${APP_URL}/brand/email-logo.png" width="180" alt="Woke &amp; Rooted" style="display:block;border:0;width:180px;height:auto;">
      </td></tr>
      <tr><td style="padding:16px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#5a4632;">
${content}
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #e3d6b4;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#7a6652;text-align:center;">
        <a href="${SITE_URL}" style="color:#4a5c36;">wokeandrooted.com</a> &nbsp;·&nbsp;
        <a href="${APP_URL}" style="color:#4a5c36;">Aplikacija za prijave</a> &nbsp;·&nbsp;
        <a href="${INSTAGRAM_URL}" style="color:#4a5c36;">Instagram</a>
        <p style="margin:8px 0 0;font-size:11px;font-style:italic;color:#9a8670;">Molimo ne odgovarajte na ovaj mejl.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}

const h1 = (t: string) => `<h1 style="margin:0 0 12px;font-size:22px;color:#5a4632;">${t}</h1>`
const p = (t: string) => `<p style="margin:0 0 12px;">${t}</p>`
const button = (label: string, href: string) =>
  `<p style="margin:24px 0;text-align:center;"><a href="${href}" style="display:inline-block;background:#4a5c36;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:6px;">${label}</a></p>`
const greeting = (name: unknown) => (name ? `Zdravo ${esc(name)},` : 'Zdravo,')

const textFooter = `\n\n—\nWoke & Rooted\n${SITE_URL} · ${APP_URL} · ${INSTAGRAM_URL}\nMolimo ne odgovarajte na ovaj mejl.`

// ---------- šabloni po vrsti mejla ----------
const templates: Record<string, (d: Payload) => Rendered> = {
  email_verified: (d) => ({
    subject: 'Email je potvrđen – Woke & Rooted',
    html: layout(
      h1('Email je potvrđen') +
      p(greeting(d.name)) +
      p('tvoja email adresa je uspešno potvrđena. Sada možeš da se prijaviš u aplikaciju i prijaviš na termine joge, radionice i 1 na 1 seanse.') +
      button('Otvori aplikaciju', APP_URL)
    ),
    text: `${greeting(d.name)}\n\ntvoja email adresa je uspešno potvrđena. Sada možeš da se prijaviš u aplikaciju: ${APP_URL}` + textFooter,
  }),
}

async function sendViaResend(to: string, r: Rendered): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject: r.subject, html: r.html, text: r.text }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Forbidden', { status: 403 })
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: batch, error } = await db.rpc('claim_emails', { p_limit: 20, p_daily_limit: 95 })
  if (error) return new Response('claim error: ' + error.message, { status: 500 })

  let sent = 0
  let failed = 0
  for (const row of batch ?? []) {
    try {
      const tpl = templates[row.kind]
      if (!tpl) throw new Error(`Nepoznata vrsta mejla: ${row.kind}`)
      await sendViaResend(row.to_email, tpl(row.payload ?? {}))
      await db.rpc('finish_email', { p_id: row.id, p_ok: true })
      sent++
    } catch (e) {
      await db.rpc('finish_email', { p_id: row.id, p_ok: false, p_error: String(e) })
      failed++
    }
    // Resend free dozvoljava 2 zahteva u sekundi
    await new Promise((r) => setTimeout(r, 600))
  }

  return Response.json({ sent, failed })
})
