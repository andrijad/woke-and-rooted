import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const INVALID_TEXT = {
  invalid: 'Link nije ispravan.',
  used: 'Ovaj link je već iskorišćen.',
  expired: 'Ovaj link je istekao.'
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

  const box = { maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }
  const input = { display: 'block', width: '100%', margin: '8px 0', padding: 8, boxSizing: 'border-box' }

  if (status === 'checking') return <div style={box}><p>Proveravam link...</p></div>

  if (status !== 'ok') {
    return (
      <div style={box}>
        <h1 style={{ fontSize: 20 }}>Registracija</h1>
        <p>{INVALID_TEXT[status] || INVALID_TEXT.invalid} Zatraži novi link od studija.</p>
        <p style={{ fontSize: 14 }}><Link to="/login">Prijava</Link></p>
      </div>
    )
  }

  if (checkEmail) {
    return (
      <div style={box}>
        <h1 style={{ fontSize: 20 }}>Proveri email</h1>
        <p>Poslali smo ti mejl za potvrdu adrese. Klikni na link u njemu, pa se prijavi.</p>
        <p style={{ fontSize: 14 }}><Link to="/login">Prijava</Link></p>
      </div>
    )
  }

  return (
    <div style={box}>
      <h1 style={{ fontSize: 20 }}>Joga studio — registracija</h1>
      <form onSubmit={handleSubmit}>
        <input placeholder="Ime i prezime" required value={form.full_name}
          onChange={e => setForm({ ...form, full_name: e.target.value })} style={input} />
        <input type="email" placeholder="Email" required value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
        <input placeholder="Telefon (opciono)" value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })} style={input} />
        <input type="password" placeholder="Lozinka (najmanje 8 karaktera)" required value={form.password}
          onChange={e => setForm({ ...form, password: e.target.value })} style={input} />
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={saving} style={{ padding: '8px 16px' }}>
          {saving ? 'Registrujem...' : 'Registruj se'}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>Već imaš nalog? <Link to="/login">Prijava</Link></p>
    </div>
  )
}
