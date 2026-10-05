import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import MembersManager from './admin/MembersManager'
import GroupsAndEvents from './admin/GroupsAndEvents'
import SignupsOverview from './admin/SignupsOverview'

const TABS = [
  { id: 'members', label: 'Članovi' },
  { id: 'groupsEvents', label: 'Grupe i događaji' },
  { id: 'signups', label: 'Termini i uplate' }
]

export default function AdminHome() {
  const { profile, logout } = useAuth()
  const [tab, setTab] = useState('members')

  return (
    <div className="shell wide">
      <header className="topbar">
        <img className="logo" src="/brand/logo-brown.svg" alt="Woke & Rooted" />
        <button className="btn-ghost" onClick={logout}>Izloguj se</button>
      </header>
      <div className="greeting">
        <h1>Zdravo, {profile?.full_name || 'vlasnice'}</h1>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'members' && <MembersManager />}
      {tab === 'groupsEvents' && <GroupsAndEvents />}
      {tab === 'signups' && <SignupsOverview />}
    </div>
  )
}
