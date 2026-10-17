import { errMsg } from '../lib/errors'
import { checkPassword, PASSWORD_HINT } from '../lib/password'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import SiteLink from '../components/SiteLink'

function Frame({ children }) {
  return (
    <div className="auth">
      <img className="logo" src="/brand/logo-yellow.svg" alt="Woke & Rooted" />
      <div className="auth-card">{children}</div>
      <SiteLink onDark />
    </div>
  )
}

function monthLabel(period) {
  const t = new Date(period + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// Otvorena registracija. Stari pozivni linkovi (?token=…) i dalje rade.
export default function Registration() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', website: '' })
  const [offers, setOffers] = useState([])
  const [choice, setChoice] = useState('') // `${group_id}|${period}`
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_open_groups_for_registration').then(({ data }) => {
      if (!cancelled) setOffers(data || [])
    })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.website) return // honeypot
    const pwErr = checkPassword(form.password)
    if (pwErr) return setError(pwErr)
    setSaving(true)
    const [group_id, period] = choice ? choice.split('|') : [null, null]
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          invite_token: token || null,
          group_id,
          period
        }
      }
    })
    if (err) {
      setError(errMsg(err))
    } else if (data.session) {
      navigate('/')
    } else {
      setCheckEmail(true)
    }
    setSaving(false)
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

  const set = k => e => setForm({ ...form, [k]: e.target.value })

  return (
    <Frame>
      <h1>Registracija</h1>
      <form onSubmit={handleSubmit}>
        <input placeholder="Ime i prezime" required value={form.full_name} onChange={set('full_name')} className="field" />
        <input type="email" placeholder="Email" required autoComplete="email" value={form.email} onChange={set('email')} className="field" />
        <input placeholder="Telefon (opciono)" value={form.phone} onChange={set('phone')} className="field" />
        <input type="password" placeholder="Lozinka" required autoComplete="new-password"
          value={form.password} onChange={set('password')} className="field" />
        <p className="small muted">{PASSWORD_HINT}</p>
        <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} />

        {offers.length > 0 && (
          <fieldset className="choice">
            <legend>Redovna joga — grupa (opciono)</legend>
            <label>
              <input type="radio" name="grp" checked={choice === ''} onChange={() => setChoice('')} /> Za sada bez grupe
            </label>
            {offers.map(o => {
              const full = o.free_spots <= 0
              const value = `${o.group_id}|${o.period}`
              return (
                <label key={value}>
                  <input type="radio" name="grp" disabled={full} checked={choice === value} onChange={() => setChoice(value)} />
                  {' '}{o.name} — {monthLabel(o.period)}
                  {o.schedule && <span className="muted"> ({o.schedule})</span>}
                  {full && <span className="muted"> · popunjeno</span>}
                </label>
              )
            })}
          </fieldset>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Registrujem...' : 'Registruj se'}</button>
      </form>
      <p className="auth-links">Već imaš nalog? <Link to="/login">Prijava</Link></p>
    </Frame>
  )
}
