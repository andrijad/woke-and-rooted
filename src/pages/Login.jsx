import { errMsg } from '../lib/errors'
import HomeLogo from '../components/HomeLogo'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SiteLink from '../components/SiteLink'
import Turnstile from '../components/Turnstile'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (TURNSTILE_SITE_KEY && !captcha) return setError('Sačekaj da se završi provera „Nisam robot“.')
    const { error } = await login(email, password, captcha)
    if (error) { setError(errMsg(error)); setCaptcha(''); setCaptchaKey(k => k + 1) }
    else navigate('/')
  }

  return (
    <div className="auth">
      <HomeLogo src="/brand/logo-yellow.svg" />
      <div className="auth-card">
        <h1>Prijava</h1>
        <form onSubmit={handleSubmit}>
          <input
            className="field" type="email" placeholder="Email" autoComplete="email" value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="field" type="password" placeholder="Lozinka" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <Turnstile onToken={setCaptcha} resetKey={captchaKey} />
          {error && <p className="error">{error}</p>}
          <button type="submit">Prijavi se</button>
        </form>
        <p className="auth-links">
          <Link to="/forgot-password">Zaboravljena lozinka?</Link>
          {' · '}
          <Link to="/registracija">Registracija</Link>
        </p>
      </div>
      <Link to="/seanse" className="auth-cta">Prijavi se za 1 na 1 seansu</Link>
      <SiteLink onDark />
    </div>
  )
}
