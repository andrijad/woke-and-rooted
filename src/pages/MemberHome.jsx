import { displayName } from '../lib/names'
import { useAuth } from '../context/AuthContext'
import SiteLink from '../components/SiteLink'
import SignupCard from './member/SignupCard'
import EventsCard from './member/EventsCard'
import OneOnOneCard from './member/OneOnOneCard'
import HistoryCard from './member/HistoryCard'

export default function MemberHome() {
  const { profile, logout } = useAuth()
  return (
    <div className="shell">
      <header className="topbar">
        <img className="logo" src="/brand/logo-brown.svg" alt="Woke & Rooted" />
        <button className="btn-ghost btn-sm" onClick={logout}>Izloguj se</button>
      </header>
      <div className="greeting">
        <h1>Zdravo, {displayName(profile, 'članice')}</h1>
      </div>
      <SignupCard />
      <EventsCard />
      <OneOnOneCard />
      <HistoryCard />
      <SiteLink />
    </div>
  )
}
