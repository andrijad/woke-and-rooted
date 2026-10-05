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
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20 }}>Zaboravljena lozinka</h1>
      {sent ? (
        <p>
          Ako nalog sa tim emailom postoji, poslali smo link za postavljanje nove lozinke.
          Proveri i spam folder.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p style={{ fontSize: 14 }}>Unesi email naloga i poslaćemo ti link za novu lozinku.</p>
          <input
            type="email" placeholder="Email" required value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8, boxSizing: 'border-box' }}
          />
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button type="submit" disabled={sending} style={{ padding: '8px 16px' }}>
            {sending ? 'Šaljem...' : 'Pošalji link'}
          </button>
        </form>
      )}
      <p style={{ marginTop: 16, fontSize: 14 }}><Link to="/login">Nazad na prijavu</Link></p>
    </div>
  )
}
