import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import MembersList from './admin/MembersList'
import Payments from './admin/Payments'
import Periods from './admin/Periods'

export default function AdminHome() {
  const { profile, logout } = useAuth()
  const [tab, setTab] = useState('members')

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20 }}>Zdravo, {profile?.full_name || 'vlasnice'}</h1>
        <button onClick={logout}>Izloguj se</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setTab('members')} style={{ fontWeight: tab === 'members' ? 700 : 400 }}>Članovi</button>
        <button onClick={() => setTab('payments')} style={{ fontWeight: tab === 'payments' ? 700 : 400 }}>Uplate</button>
        <button onClick={() => setTab('periods')} style={{ fontWeight: tab === 'periods' ? 700 : 400 }}>Termini</button>
      </div>
      {tab === 'members' && <MembersList />}
      {tab === 'payments' && <Payments />}
      {tab === 'periods' && <Periods />}
    </div>
  )
}