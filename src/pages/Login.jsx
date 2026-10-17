import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SiteLink from '../components/SiteLink'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const { error } = await login(email, password)
    if (error) setError(error.message)
    else navigate('/')
  }

  return (
    <div className="auth">
      <img className="logo" src="/brand/logo-yellow.svg" alt="Woke & Rooted" />
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
