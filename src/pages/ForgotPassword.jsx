import { useState } from 'react'
import HomeLogo from '../components/HomeLogo'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import SiteLink from '../components/SiteLink'
import Turnstile from '../components/Turnstile'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (TURNSTILE_SITE_KEY && !captcha) return setError('Sačekaj da se završi provera „Nisam robot“.')
    setSending(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: captcha || undefined
    })
    if (err) { setError('Slanje nije uspelo. Pokušaj ponovo za nekoliko minuta.'); setCaptcha(''); setCaptchaKey(k => k + 1) }
    else setSent(true)
    setSending(false)
  }

  return (
    <div className="auth">
      <HomeLogo src="/brand/logo-yellow.svg" />
      <div className="auth-card">
      <h1>Zaboravljena lozinka</h1>
      {sent ? (
        <p>
          Ako nalog sa tim emailom postoji, poslali smo link za postavljanje nove lozinke.
          Proveri i spam folder.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p className="small">Unesi email naloga i poslaćemo ti link za novu lozinku.</p>
          <input
            className="field" type="email" placeholder="Email" required value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <Turnstile onToken={setCaptcha} resetKey={captchaKey} />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={sending}>
            {sending ? 'Šaljem...' : 'Pošalji link'}
          </button>
        </form>
      )}
      <p className="auth-links"><Link to="/login">Nazad na prijavu</Link></p>
      </div>
      <SiteLink onDark />
    </div>
  )
}
