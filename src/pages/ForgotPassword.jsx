import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (err) setError('Slanje nije uspelo. Pokušaj ponovo za nekoliko minuta.')
    else setSent(true)
    setSending(false)
  }

  return (
    <div className="auth">
      <img className="logo" src="/brand/logo-yellow.svg" alt="Woke & Rooted" />
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
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={sending}>
            {sending ? 'Šaljem...' : 'Pošalji link'}
          </button>
        </form>
      )}
      <p className="auth-links"><Link to="/login">Nazad na prijavu</Link></p>
      </div>
    </div>
  )
}
