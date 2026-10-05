import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // link iz emaila daje privremenu sesiju (PASSWORD_RECOVERY)
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setReady(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => { if (session) setReady(true) })
    const t = setTimeout(() => setExpired(true), 4000)
    return () => { listener.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Lozinka mora imati najmanje 8 karaktera.')
    if (password !== repeat) return setError('Lozinke se ne poklapaju.')
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) setError(err.message)
    else {
      setDone(true)
      setTimeout(() => navigate('/'), 1500)
    }
    setSaving(false)
  }

  return (
    <div className="auth">
      <img className="logo" src="/brand/logo-yellow.svg" alt="Woke & Rooted" />
      <div className="auth-card">
      <h1>Nova lozinka</h1>

      {done && <p className="success">✓ Lozinka je promenjena. Prijavljena si.</p>}

      {!done && ready && (
        <form onSubmit={handleSubmit}>
          <input className="field" type="password" placeholder="Nova lozinka" autoComplete="new-password" value={password}
            onChange={e => setPassword(e.target.value)} />
          <input className="field" type="password" placeholder="Ponovi lozinku" autoComplete="new-password" value={repeat}
            onChange={e => setRepeat(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>Sačuvaj lozinku</button>
        </form>
      )}

      {!done && !ready && !expired && <p>Proveravam link...</p>}

      {!done && !ready && expired && (
        <p>
          Link nije ispravan ili je istekao. <Link to="/forgot-password">Pošalji novi link</Link>.
        </p>
      )}
      </div>
    </div>
  )
}
