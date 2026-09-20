import { useAuth } from '../context/AuthContext'
import SignupCard from './member/SignupCard'

export default function MemberHome() {
  const { profile, logout } = useAuth()
  return (
    <div style={{ maxWidth: 480, margin: '40px auto', fontFamily: 'system-ui', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 20 }}>Zdravo, {profile?.full_name || 'članice'}</h1>
        <button onClick={logout}>Izloguj se</button>
      </div>
      <SignupCard />
    </div>
  )
}