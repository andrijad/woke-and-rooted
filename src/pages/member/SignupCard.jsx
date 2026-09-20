import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

function buildIpsQrString({ accountNumber, recipientName, amount, purposeCode, refCode }) {
  const amountFormatted = amount.toFixed(2).replace('.', ',')
  return [
    'K:PR', 'V:01', 'C:1',
    `R:${accountNumber}`,
    `N:${recipientName}`,
    `I:RSD${amountFormatted}`,
    `SF:${purposeCode}`,
    `RO:${refCode}`
  ].join('|')
}

function makeRefCode(period, memberId) {
  const yy = period.slice(2, 4)
  const mm = period.slice(5, 7)
  const suffix = memberId.replace(/-/g, '').slice(-4).toUpperCase()
  return `${yy}${mm}-${suffix}`
}

export default function SignupCard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState(null)
  const [period, setPeriod] = useState(null)
  const [signup, setSignup] = useState(null)
  const [settings, setSettings] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [signingUp, setSigningUp] = useState(false)

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
    const [{ data: memberships }, { data: periods }, { data: settingsData }] = await Promise.all([
      supabase.from('group_memberships').select('*, groups(*)').eq('member_id', profile.id).eq('active', true),
      supabase.from('signup_periods').select('*').order('period', { ascending: false }).limit(1),
      supabase.from('studio_settings').select('*').eq('id', 1).single()
    ])
    const myGroup = memberships?.[0]?.groups || null
    const latestPeriod = periods?.[0] || null
    setGroup(myGroup)
    setPeriod(latestPeriod)
    setSettings(settingsData || null)

    if (myGroup && latestPeriod) {
      const { data: existing } = await supabase
        .from('monthly_signups')
        .select('*')
        .eq('member_id', profile.id)
        .eq('group_id', myGroup.id)
        .eq('period', latestPeriod.period)
        .maybeSingle()
      setSignup(existing || null)
      if (existing && existing.status === 'due' && settingsData) {
        await generateQr(existing, settingsData)
      }
    }
    setLoading(false)
  }

  async function generateQr(signupRow, settingsData) {
    const str = buildIpsQrString({
      accountNumber: settingsData.account_number,
      recipientName: settingsData.recipient_name,
      amount: signupRow.amount,
      purposeCode: settingsData.purpose_code,
      refCode: signupRow.ref_code
    })
    const url = await QRCode.toDataURL(str, { margin: 1, width: 220 })
    setQrUrl(url)
  }

  async function handleSignup() {
    if (!group || !period) return
    setSigningUp(true)
    const refCode = makeRefCode(period.period, profile.id)
    const { data, error } = await supabase
      .from('monthly_signups')
      .insert({
        group_id: group.id,
        member_id: profile.id,
        period: period.period,
        amount: group.monthly_price,
        ref_code: refCode,
        status: 'due'
      })
      .select()
      .single()
    if (error) {
      alert('Greška: ' + error.message)
    } else {
      setSignup(data)
      if (settings) await generateQr(data, settings)
    }
    setSigningUp(false)
  }

  if (loading) return <p>Učitavanje...</p>
  if (!group) return <p>Vlasnica te još nije rasporedila u grupu.</p>
  if (!period) return <p>Prijave za sledeći mesec još nisu otvorene.</p>

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>{group.name} · {group.time_label}</h3>
      <p>Period: {period.period} · {group.monthly_price} RSD</p>

      {!signup && (
        <button onClick={handleSignup} disabled={signingUp}>Prijavi se</button>
      )}

      {signup && signup.status === 'paid' && (
        <p style={{ color: 'green', fontWeight: 700 }}>✓ Uplata potvrđena</p>
      )}

      {signup && signup.status === 'due' && (
        <div>
          <p>Čeka se uplata. Poziv na broj: {signup.ref_code}</p>
          {qrUrl && <img src={qrUrl} alt="IPS QR kod" width={220} height={220} />}
        </div>
      )}
    </div>
  )
}