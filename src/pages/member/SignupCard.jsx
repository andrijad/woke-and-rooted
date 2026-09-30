import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { buildIpsQrString, makeRefCode } from '../../lib/ips'
import { WEEKDAY_NAMES } from '../../lib/schedule'

export default function SignupCard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState(null)
  const [scheduleLabel, setScheduleLabel] = useState('')
  const [openPeriod, setOpenPeriod] = useState(null)
  const [signup, setSignup] = useState(null)
  const [settings, setSettings] = useState(null)
  const [qrUrl, setQrUrl] = useState(null)
  const [signingUp, setSigningUp] = useState(false)
  const [groupFull, setGroupFull] = useState(false)

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
    const [{ data: memberships }, { data: settingsData }] = await Promise.all([
      supabase.from('group_memberships').select('*, groups(*)').eq('member_id', profile.id).eq('active', true),
      supabase.from('studio_settings').select('*').eq('id', 1).single()
    ])
    const myGroup = memberships?.[0]?.groups || null
    setGroup(myGroup)
    setSettings(settingsData || null)

    if (myGroup) {
      const { data: scheduleRows } = await supabase
        .from('group_schedule')
        .select('*')
        .eq('group_id', myGroup.id)
        .order('weekday')
      setScheduleLabel(
        (scheduleRows || [])
          .map(s => `${WEEKDAY_NAMES[s.weekday]} ${s.start_time.slice(0, 5)}h`)
          .join(', ')
      )

      // najnoviju prijavu ovog člana za ovu grupu prikazujemo uvek,
      // bez obzira da li je period u međuvremenu zatvoren
      const { data: existingRows } = await supabase
        .from('monthly_signups')
        .select('*')
        .eq('member_id', profile.id)
        .eq('group_id', myGroup.id)
        .order('period', { ascending: false })
        .limit(1)
      const existing = existingRows?.[0] || null
      setSignup(existing)

      // period otvoren za NOVE prijave (samo ako član još nema svoju)
      let openPeriodRow = null
      if (!existing) {
        const { data: periodRows } = await supabase
          .from('group_signup_periods')
          .select('*')
          .eq('group_id', myGroup.id)
          .eq('is_open', true)
          .order('period', { ascending: false })
          .limit(1)
        openPeriodRow = periodRows?.[0] || null
      }
      setOpenPeriod(openPeriodRow)

      if (!existing && openPeriodRow && myGroup.capacity != null) {
        const { data: count } = await supabase.rpc('count_monthly_signups', {
          p_group_id: myGroup.id,
          p_period: openPeriodRow.period
        })
        setGroupFull((count || 0) >= myGroup.capacity)
      } else {
        setGroupFull(false)
      }

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
    if (!group || !openPeriod) return
    setSigningUp(true)
    const refCode = makeRefCode(openPeriod.period, profile.id)
    const { data, error } = await supabase
      .from('monthly_signups')
      .insert({
        group_id: group.id,
        member_id: profile.id,
        period: openPeriod.period,
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

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>{group.name}{scheduleLabel && ` · ${scheduleLabel}`}</h3>

      {signup && (
        <>
          <p>Period: {signup.period} · {signup.amount} RSD</p>
          {signup.status === 'paid' && (
            <p style={{ color: 'green', fontWeight: 700 }}>✓ Uplata potvrđena</p>
          )}
          {signup.status === 'due' && (
            <div>
              <p>Čeka se uplata. Poziv na broj: {signup.ref_code}</p>
              {qrUrl && <img src={qrUrl} alt="IPS QR kod" width={220} height={220} />}
            </div>
          )}
        </>
      )}

      {!signup && group.archived && (
        <p style={{ color: '#a33', fontWeight: 600 }}>Ova grupa je arhivirana — prijava trenutno nije moguća.</p>
      )}

      {!signup && !group.archived && !openPeriod && (
        <p style={{ color: '#666' }}>Prijave za ovu grupu trenutno nisu otvorene.</p>
      )}

      {!signup && !group.archived && openPeriod && !groupFull && (
        <div>
          <p>Period: {openPeriod.period} · {group.monthly_price} RSD</p>
          <button onClick={handleSignup} disabled={signingUp}>Prijavi se</button>
        </div>
      )}

      {!signup && !group.archived && openPeriod && groupFull && (
        <p style={{ color: '#a33', fontWeight: 600 }}>Grupa je popunjena</p>
      )}
    </div>
  )
}