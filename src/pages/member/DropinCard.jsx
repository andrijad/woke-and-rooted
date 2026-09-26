import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { buildIpsQrString, makeDropinRefCode } from '../../lib/ips'

export default function DropinCard() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState([])
  const [settings, setSettings] = useState(null)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [signingUp, setSigningUp] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    const [{ data: groupsData }, { data: settingsData }] = await Promise.all([
      supabase.from('groups').select('*').eq('active', true).order('name'),
      supabase.from('studio_settings').select('*').eq('id', 1).single()
    ])
    setGroups(groupsData || [])
    setSettings(settingsData || null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedGroup || !sessionDate) return
    setSigningUp(true)
    setResult(null)
    const group = groups.find(g => g.id === selectedGroup)
    const refCode = makeDropinRefCode(sessionDate, profile.id, selectedGroup)

    const { data, error } = await supabase
      .from('dropin_signups')
      .insert({
        group_id: selectedGroup,
        member_id: profile.id,
        session_date: sessionDate,
        amount: group.dropin_price,
        ref_code: refCode,
        status: 'due'
      })
      .select()
      .single()

    if (error) {
      setResult({
        error: error.message.includes('već mesečno')
          ? 'Već si mesečno prijavljena za ovu grupu u tom mesecu — individualni čas nije potreban.'
          : error.message
      })
    } else if (settings) {
      const str = buildIpsQrString({
        accountNumber: settings.account_number,
        recipientName: settings.recipient_name,
        amount: data.amount,
        purposeCode: settings.purpose_code,
        refCode: data.ref_code
      })
      const qrUrl = await QRCode.toDataURL(str, { margin: 1, width: 220 })
      setResult({ signup: data, qrUrl })
    }
    setSigningUp(false)
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Individualni čas</h3>
      {!result?.signup && (
        <form onSubmit={handleSubmit}>
          <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)} required
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}>
            <option value="">— izaberi grupu —</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name} · {g.dropin_price} RSD</option>
            ))}
          </select>
          <input
            type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} required
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <button type="submit" disabled={signingUp}>Prijavi se</button>
        </form>
      )}
      {result?.error && <p style={{ color: 'crimson' }}>{result.error}</p>}
      {result?.signup && (
        <div>
          <p>Poziv na broj: {result.signup.ref_code} · {result.signup.amount} RSD</p>
          <img src={result.qrUrl} alt="IPS QR kod" width={220} height={220} />
        </div>
      )}
    </div>
  )
}