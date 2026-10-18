// Edge funkcija: šalje mejlove iz reda public.email_outbox preko Resend-a.
// Poziva je pg_cron (svakog minuta, samo kad ima mejlova u redu) sa zaglavljem x-cron-secret.
// Secrets (Supabase → Edge Functions → Secrets): RESEND_API_KEY, CRON_SECRET.
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY Supabase daje automatski.
import { createClient } from 'npm:@supabase/supabase-js@2'
import QRCode from 'npm:qrcode@1.5.4'

const FROM = 'Woke & Rooted <noreply@wokeandrooted.com>'
const APP_URL = 'https://prijave.wokeandrooted.com'
const SITE_URL = 'https://wokeandrooted.com'
const INSTAGRAM_URL = 'https://www.instagram.com/woke.and.rooted'

type Payload = Record<string, unknown>
type Attachment = { filename: string; content: string; content_type: string; content_id: string }
type Rendered = { subject: string; html: string; text: string; attachments?: Attachment[]; unsubscribe?: string }

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ---------- zajednički izgled (isti kao šabloni u supabase/email-templates) ----------
function layout(content: string, unsubscribeUrl?: unknown): string {
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
        <p style="margin:8px 0 0;font-size:11px;font-style:italic;color:#9a8670;">Molimo ne odgovarajte na ovaj mejl.</p>${unsubscribeUrl ? `
        <p style="margin:6px 0 0;font-size:11px;color:#9a8670;"><a href="${esc(unsubscribeUrl)}" style="color:#9a8670;">Ne želim obaveštenja o novim terminima</a></p>` : ''}
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

// ---------- HTML opisa događaja (iz editora) — samo dozvoljene oznake ----------
const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a'])
function sanitize(html: unknown): string {
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag: string, attrs: string) => {
      const t = tag.toLowerCase()
      if (!ALLOWED.has(t)) return ''
      if (m.startsWith('</')) return `</${t}>`
      if (t === 'a') {
        const href = /href\s*=\s*"(https?:\/\/[^"]*)"/i.exec(attrs)?.[1]
        return href ? `<a href="${esc(href)}" style="color:#4a5c36;">` : '<a>'
      }
      return `<${t}>`
    })
}

// ---------- uplata (IPS QR + podaci) ----------
const REF_MODEL = '99'

function ipsString(d: Payload): string {
  const amount = Number(d.amount).toFixed(2).replace('.', ',')
  return ['K:PR', 'V:01', 'C:1', `R:${d.account_number}`, `N:${d.recipient_name}`,
    `I:RSD${amount}`, `SF:${d.purpose_code}`, `RO:${REF_MODEL}${d.ref_code}`].join('|')
}

const hasPayment = (d: Payload) => !d.paid && Number(d.amount) > 0 && !!d.account_number && !!d.ref_code

function paymentHtml(d: Payload): string {
  const row = (k: string, v: unknown) =>
    `<tr><td style="padding:6px 0;color:#7a6652;font-size:14px;">${k}</td><td style="padding:6px 0;text-align:right;font-weight:bold;font-size:14px;">${esc(v)}</td></tr>`
  return `
        <div style="margin:20px 0;padding:16px;border:1px solid #e3d6b4;border-radius:8px;background:#fffdf6;">
          <p style="margin:0 0 10px;font-weight:bold;">Podaci za uplatu</p>
          <p style="margin:0 0 12px;text-align:center;"><img src="cid:ips-qr" width="200" height="200" alt="IPS QR kod za uplatu" style="display:inline-block;border:0;"></p>
          <p style="margin:0 0 12px;font-size:13px;color:#7a6652;text-align:center;">Skeniraj QR kod u aplikaciji svoje banke (IPS skeniraj) ili uplati ručno:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${row('Primalac', d.recipient_name)}
            ${row('Račun', d.account_number)}
            ${row('Iznos', `${d.amount} RSD`)}
            ${row('Šifra plaćanja', d.purpose_code)}
            ${row('Model', REF_MODEL)}
            ${row('Poziv na broj', d.ref_code)}
          </table>
        </div>`
}

function paymentText(d: Payload): string {
  return `\nPodaci za uplatu:\nPrimalac: ${d.recipient_name}\nRačun: ${d.account_number}\nIznos: ${d.amount} RSD\nŠifra plaćanja: ${d.purpose_code}\nModel: ${REF_MODEL}\nPoziv na broj: ${d.ref_code}\n`
}

async function qrAttachment(d: Payload): Promise<Attachment> {
  const dataUrl: string = await QRCode.toDataURL(ipsString(d), { margin: 1, width: 400 })
  return { filename: 'ips-qr.png', content: dataUrl.split(',')[1], content_type: 'image/png', content_id: 'ips-qr' }
}

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

  signup_created: (d) => ({
    subject: `Prijava: ${d.label}`,
    html: layout(
      h1('Prijava je primljena') +
      p(greeting(d.name)) +
      p(`tvoja prijava za <strong>${esc(d.label)}</strong> je primljena.` +
        (hasPayment(d) ? ' Podaci za uplatu su ispod. Kad ' + esc(d.owner) + ' potvrdi uplatu, videćeš to u aplikaciji.' : '')) +
      (hasPayment(d) ? paymentHtml(d) : '') +
      button('Otvori aplikaciju', APP_URL)
    ),
    text: `${greeting(d.name)}\n\ntvoja prijava za ${d.label} je primljena.\n` + (hasPayment(d) ? paymentText(d) : '') + `\n${APP_URL}` + textFooter,
  }),

  signup_added: (d) => ({
    subject: `${d.owner} te je dodala u ${d.label}`,
    html: layout(
      h1('Nova prijava') +
      p(greeting(d.name)) +
      p(`${esc(d.owner)} te je dodala u <strong>${esc(d.label)}</strong>.` +
        (hasPayment(d) ? ' Podaci za uplatu su ispod.' : '')) +
      (hasPayment(d) ? paymentHtml(d) : '') +
      button('Otvori aplikaciju', APP_URL)
    ),
    text: `${greeting(d.name)}\n\n${d.owner} te je dodala u ${d.label}.\n` + (hasPayment(d) ? paymentText(d) : '') + `\n${APP_URL}` + textFooter,
  }),

  // ---------- masovna obaveštenja ----------
  month_open: (d) => {
    const groups = (Array.isArray(d.groups) ? d.groups : []) as Payload[]
    const list = groups.map((g) =>
      `<li style="margin:0 0 6px;"><strong>${esc(g.name)}</strong>${g.schedule ? ' – ' + esc(g.schedule) : ''}${g.price ? ` <span style="color:#7a6652;">(${esc(g.price)} RSD mesečno)</span>` : ''}</li>`).join('')
    return {
      subject: `Otvorene su prijave za jogu – ${d.month}`,
      html: layout(
        h1(`Prijave za ${esc(d.month)} su otvorene`) +
        p(greeting(d.name)) +
        p(`otvorene su prijave za redovnu jogu za <strong>${esc(d.month)}</strong>.`) +
        (list ? `<ul style="margin:0 0 12px;padding-left:20px;">${list}</ul>` : '') +
        p('Prijavi se u aplikaciji dok ima mesta.') +
        button('Prijavi se', APP_URL),
        d.unsubscribe_url
      ),
      text: `${greeting(d.name)}\n\notvorene su prijave za redovnu jogu za ${d.month}.\n` +
        groups.map((g) => `- ${g.name}${g.schedule ? ' – ' + g.schedule : ''}${g.price ? ` (${g.price} RSD)` : ''}`).join('\n') +
        `\n\nPrijava: ${APP_URL}` + textFooter + `\nOdjava od obaveštenja: ${d.unsubscribe_url}`,
      unsubscribe: String(d.unsubscribe_url ?? ''),
    }
  },

  event_announce: (d) => ({
    subject: `Pozivamo te na ${d.event_name}`,
    html: layout(
      h1(esc(d.event_name)) +
      p(greeting(d.name)) +
      (d.description_short ? p(esc(d.description_short)) : '') +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
          <tr><td style="padding:4px 0;color:#7a6652;">Kada</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${esc(d.when)}</td></tr>
          <tr><td style="padding:4px 0;color:#7a6652;">Cena</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${esc(d.price)} RSD</td></tr>
        </table>` +
      (d.description_html ? `<div style="margin:0 0 12px;">${sanitize(d.description_html)}</div>` : '') +
      button('Prijavi se', APP_URL),
      d.unsubscribe_url
    ),
    text: `${greeting(d.name)}\n\n${d.event_name}\n${d.description_short ?? ''}\nKada: ${d.when}\nCena: ${d.price} RSD\n\nPrijava: ${APP_URL}` +
      textFooter + `\nOdjava od obaveštenja: ${d.unsubscribe_url}`,
    unsubscribe: String(d.unsubscribe_url ?? ''),
  }),

  // ---------- 1 na 1 seanse ----------
  oneonone_received: (d) => ({
    subject: 'Upit za 1 na 1 seansu je primljen – Woke & Rooted',
    html: layout(
      h1('Upit je primljen') +
      p(greeting(d.name)) +
      p(`hvala na upitu za <strong>${esc(d.session_type)}</strong>. ${esc(d.owner)} će ti se javiti da dogovorite termin.`) +
      p('Status upita možeš da pratiš na linku ispod.') +
      button('Prati status upita', String(d.status_url))
    ),
    text: `${greeting(d.name)}\n\nhvala na upitu za ${d.session_type}. ${d.owner} će ti se javiti da dogovorite termin.\nStatus: ${d.status_url}` + textFooter,
  }),

  oneonone_scheduled: (d) => sessionMail(d, 'Termin je zakazan', `Termin za 1 na 1 seansu: ${d.when}`,
    'tvoj termin za 1 na 1 seansu je zakazan.'),

  oneonone_rescheduled: (d) => sessionMail(d, 'Izmena seanse', `Izmena: 1 na 1 seansa ${d.when}`,
    'podaci tvoje 1 na 1 seanse su izmenjeni. Aktuelni termin i cena su ispod.'),

  oneonone_paid: (d) => ({
    subject: 'Uplata je potvrđena – Woke & Rooted',
    html: layout(
      h1('Uplata je potvrđena') +
      p(greeting(d.name)) +
      p(`uplata za 1 na 1 seansu (<strong>${esc(d.session_type)}</strong>) je potvrđena. Vidimo se ${esc(d.when)}.`) +
      button('Pogledaj termin', String(d.status_url))
    ),
    text: `${greeting(d.name)}\n\nuplata za 1 na 1 seansu (${d.session_type}) je potvrđena. Vidimo se ${d.when}.\n${d.status_url}` + textFooter,
  }),

  oneonone_cancelled: (d) => ({
    subject: '1 na 1 seansa je otkazana – Woke & Rooted',
    html: layout(
      h1('Seansa je otkazana') +
      p(greeting(d.name)) +
      p(`1 na 1 seansa (<strong>${esc(d.session_type)}</strong>${d.when ? ', ' + esc(d.when) : ''}) je otkazana.`) +
      p(`Ako želiš novi termin, pošalji novi upit ili se javi ${esc(d.owner)}.`) +
      button('Pošalji novi upit', `${APP_URL}/seanse`)
    ),
    text: `${greeting(d.name)}\n\n1 na 1 seansa (${d.session_type}${d.when ? ', ' + d.when : ''}) je otkazana.\nNovi upit: ${APP_URL}/seanse` + textFooter,
  }),
}

function sessionMail(d: Payload, title: string, subject: string, intro: string): Rendered {
  const row = (k: string, v: unknown) =>
    v ? `<tr><td style="padding:4px 0;color:#7a6652;">${k}</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${esc(v)}</td></tr>` : ''
  const details = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
          ${row('Seansa', d.session_type)}
          ${row('Termin', d.when)}
          ${row('Način', d.mode)}
          ${row('Cena', d.amount ? `${d.amount} RSD` : '')}
        </table>`
  return {
    subject,
    html: layout(
      h1(title) +
      p(greeting(d.name)) +
      p(intro) +
      details +
      (hasPayment(d) ? paymentHtml(d) : '') +
      button('Prati status', String(d.status_url))
    ),
    text: `${greeting(d.name)}\n\n${intro}\nSeansa: ${d.session_type}\nTermin: ${d.when}\n` +
      (d.mode ? `Način: ${d.mode}\n` : '') + (hasPayment(d) ? paymentText(d) : '') + `\nStatus: ${d.status_url}` + textFooter,
  }
}

// Mejlovi sa podacima za uplatu dobijaju IPS QR kao ugrađenu sliku (cid:ips-qr).
const WITH_QR = new Set(['signup_created', 'signup_added', 'oneonone_scheduled', 'oneonone_rescheduled'])

async function sendViaResend(to: string, r: Rendered): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM, to: [to], subject: r.subject, html: r.html, text: r.text, attachments: r.attachments,
      headers: r.unsubscribe ? { 'List-Unsubscribe': `<${r.unsubscribe}>` } : undefined,
    }),
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
      const payload = row.payload ?? {}
      const rendered = tpl(payload)
      if (WITH_QR.has(row.kind) && hasPayment(payload)) rendered.attachments = [await qrAttachment(payload)]
      await sendViaResend(row.to_email, rendered)
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
