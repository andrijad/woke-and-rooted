// Edge funkcija: prima upit za 1 na 1 seansu iz javne forme.
// 1) proveri Cloudflare Turnstile token, 2) ako je poslat token prijavljenog člana, veže upit za njega,
// 3) upiše upit preko service role (direktan upis u tabelu je zatvoren, migracija 043).
// Secrets: TURNSTILE_SECRET (isti Secret Key kao za Supabase Attack Protection).
// Verify JWT: isključen (forma je javna; član se prepoznaje ručno iz Authorization zaglavlja).
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://prijave.wokeandrooted.com', 'http://localhost:5173']
const MODES = ['uzivo', 'online', 'svejedno']

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method' }), { status: 405, headers })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers }) }

  // 1) Turnstile
  const secret = Deno.env.get('TURNSTILE_SECRET')
  const captcha = str(body.captchaToken, 2048)
  if (!secret || !captcha) return new Response(JSON.stringify({ error: 'captcha' }), { status: 400, headers })
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', captcha)
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (ip) form.append('remoteip', ip)
  const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
  const result = await check.json().catch(() => ({ success: false }))
  if (!result.success) return new Response(JSON.stringify({ error: 'captcha' }), { status: 400, headers })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // 2) prijavljen član? (token iz zaglavlja; za goste je to javni ključ i getUser ne uspeva)
  let memberId: string | null = null
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (jwt) {
    const { data } = await db.auth.getUser(jwt)
    if (data?.user) memberId = data.user.id
  }

  // 3) provera i upis
  const row = {
    access_token: crypto.randomUUID(),
    member_id: memberId,
    full_name: str(body.full_name, 120),
    email: str(body.email, 200).toLowerCase(),
    phone: str(body.phone, 60) || null,
    session_type: str(body.session_type, 80),
    first_time: body.first_time === true,
    topic: str(body.topic, 1500),
    preferred_times: str(body.preferred_times, 300) || null,
    mode: MODES.includes(String(body.mode)) ? String(body.mode) : 'svejedno',
    message: str(body.message, 2000) || null,
    consent: body.consent === true,
  }
  if (!row.full_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email) || !row.session_type || !row.topic || !row.consent) {
    return new Response(JSON.stringify({ error: 'invalid' }), { status: 400, headers })
  }

  const { error } = await db.from('one_on_one_requests').insert(row)
  if (error) {
    const rate = /rate_limit/.test(error.message)
    return new Response(JSON.stringify({ error: rate ? 'rate_limit' : 'insert' }), { status: rate ? 429 : 500, headers })
  }
  return new Response(JSON.stringify({ token: row.access_token }), { status: 200, headers })
})
