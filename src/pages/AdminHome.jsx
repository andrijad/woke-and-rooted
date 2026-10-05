import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import MembersManager from './admin/MembersManager'
import GroupsAndEvents from './admin/GroupsAndEvents'
import SignupsOverview from './admin/SignupsOverview'

export default function AdminHome() {
  const { profile, logout } = useAuth()
  const [tab, setTab] = useState('members')

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20 }}>Zdravo, {profile?.full_name || 'vlasnice'}</h1>
        <button onClick={logout}>Izloguj se</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('members')} style={{ fontWeight: tab === 'members' ? 700 : 400 }}>Članovi</button>
        <button onClick={() => setTab('groupsEvents')} style={{ fontWeight: tab === 'groupsEvents' ? 700 : 400 }}>Grupe i događaji</button>
        <button onClick={() => setTab('signups')} style={{ fontWeight: tab === 'signups' ? 700 : 400 }}>Termini i uplate</button>
      </div>
      {tab === 'members' && <MembersManager />}
      {tab === 'groupsEvents' && <GroupsAndEvents />}
      {tab === 'signups' && <SignupsOverview />}
    </div>
  )
}
