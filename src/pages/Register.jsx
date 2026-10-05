import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const INVALID_TEXT = {
  invalid: 'Link nije ispravan.',
  used: 'Ovaj link je već iskorišćen.',
  expired: 'Ovaj link je istekao.'
}

function Frame({ children }) {
  return (
    <div className="auth">
      <img className="logo" src="/brand/logo-yellow.svg" alt="Woke & Rooted" />
      <div className="auth-card">{children}</div>
    </div>
  )
}

export default function Register() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()

  const [status, setStatus] = useState('checking') // checking | ok | invalid | used | expired
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!token) { setStatus('invalid'); return }
      const { data, error: err } = await supabase.rpc('get_invite_status', { p_token: token })
      if (cancelled) return
      const row = data?.[0]
      if (err || !row) { setStatus('invalid'); return }
      setStatus(row.status)
      if (row.status === 'ok' && row.member_name) {
        setForm(f => ({ ...f, full_name: row.member_name }))
      }
    }
    check()
    return () => { cancelled = true }
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) return setError('Lozinka mora imati najmanje 8 karaktera.')
    setSaving(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          invite_token: token
        }
      }
    })
    if (err) {
      setError(err.message.includes('Database error')
        ? 'Link nije važeći ili je već iskorišćen. Zatraži novi.'
        : err.message)
    } else if (data.session) {
      navigate('/')
    } else {
      setCheckEmail(true)
    }
    setSaving(false)
  }

  if (status === 'checking') return <Frame><p>Proveravam link...</p></Frame>

  if (status !== 'ok') {
    return (
      <Frame>
        <h1>Registracija</h1>
        <p>{INVALID_TEXT[status] || INVALID_TEXT.invalid} Zatraži novi link od studija.</p>
        <p className="auth-links"><Link to="/login">Prijava</Link></p>
      </Frame>
    )
  }

  if (checkEmail) {
    return (
      <Frame>
        <h1>Proveri email</h1>
        <p>Poslali smo ti mejl za potvrdu adrese. Klikni na link u njemu, pa se prijavi.</p>
        <p className="auth-links"><Link to="/login">Prijava</Link></p>
      </Frame>
    )
  }

  return (
    <Frame>
      <h1>Registracija</h1>
      <form onSubmit={handleSubmit}>
        <input placeholder="Ime i prezime" required value={form.full_name}
          onChange={e => setForm({ ...form, full_name: e.target.value })} className="field" />
        <input type="email" placeholder="Email" required value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })} className="field" />
        <input placeholder="Telefon (opciono)" value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })} className="field" />
        <input type="password" placeholder="Lozinka (najmanje 8 karaktera)" required value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })} className="field" />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Registrujem...' : 'Registruj se'}
        </button>
      </form>
      <p className="auth-links">Već imaš nalog? <Link to="/login">Prijava</Link></p>
    </Frame>
  )
}
