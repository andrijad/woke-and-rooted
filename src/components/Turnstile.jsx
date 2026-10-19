import { useEffect, useRef } from 'react'

// Cloudflare Turnstile (zaštita od botova) za prijavu, registraciju i reset lozinke.
// Ako VITE_TURNSTILE_SITE_KEY nije podešen, ne prikazuje se ništa (i Supabase captcha mora biti isključena).
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise = null

function loadScript() {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => { scriptPromise = null; reject(new Error('turnstile')) }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

// onToken(token) se zove kad je provera prošla; onToken('') kad token istekne.
// Promena `resetKey` traži novu proveru (token važi samo za jedan pokušaj).
export default function Turnstile({ onToken, resetKey = 0 }) {
  const box = useRef(null)
  const cb = useRef(onToken)
  useEffect(() => { cb.current = onToken })

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return
    let widgetId = null
    let cancelled = false
    loadScript().then(() => {
      if (cancelled || !box.current) return
      widgetId = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'light',
        callback: t => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current('')
      })
    }).catch(() => cb.current(''))
    return () => {
      cancelled = true
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div className="turnstile" ref={box} />
}
