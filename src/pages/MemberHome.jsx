import { useAuth } from '../context/AuthContext'
import SignupCard from './member/SignupCard'
import DropinCard from './member/DropinCard'
import EventsCard from './member/EventsCard'

export default function MemberHome() {
  const { profile, logout } = useAuth()
  return (
    <div className="shell">
      <header className="topbar">
        <img className="logo" src="/brand/logo-brown.svg" alt="Woke & Rooted" />
        <button className="btn-ghost btn-sm" onClick={logout}>Izloguj se</button>
      </header>
      <div className="greeting">
        <h1>Zdravo, {profile?.full_name || 'članice'}</h1>
      </div>
      <SignupCard />
      <DropinCard />
      <EventsCard />
    </div>
  )
}
