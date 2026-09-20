import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
    <div style={{ maxWidth: 320, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 20 }}>Joga studio — prijava</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
        />
        <input
          type="password" placeholder="Lozinka" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
        />
        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
        <button type="submit" style={{ padding: '8px 16px' }}>Uloguj se</button>
      </form>
    </div>
  )
}