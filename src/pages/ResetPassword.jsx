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
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20 }}>Nova lozinka</h1>

      {done && <p style={{ color: 'green' }}>✓ Lozinka je promenjena. Prijavljena si.</p>}

      {!done && ready && (
        <form onSubmit={handleSubmit}>
          <input type="password" placeholder="Nova lozinka" value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8, boxSizing: 'border-box' }} />
          <input type="password" placeholder="Ponovi lozinku" value={repeat}
            onChange={e => setRepeat(e.target.value)}
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8, boxSizing: 'border-box' }} />
          {error && <p style={{ color: 'crimson' }}>{error}</p>}
          <button type="submit" disabled={saving} style={{ padding: '8px 16px' }}>Sačuvaj lozinku</button>
        </form>
      )}

      {!done && !ready && !expired && <p>Proveravam link...</p>}

      {!done && !ready && expired && (
        <p>
          Link nije ispravan ili je istekao. <Link to="/forgot-password">Pošalji novi link</Link>.
        </p>
      )}
    </div>
  )
}
