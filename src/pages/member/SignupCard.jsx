import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { buildIpsQrString, makeRefCode } from '../../lib/ips'
import { WEEKDAY_NAMES } from '../../lib/schedule'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'

function currentMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function monthLabel(period) {
  const s = new Date(period + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function SignupCard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [mySignups, setMySignups] = useState([])
  const [openOffers, setOpenOffers] = useState([]) // [{ period, groups: [{ group, full }] }]
  const [scheduleByGroup, setScheduleByGroup] = useState({})
  const [qrById, setQrById] = useState({})
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { if (profile) load() }, [profile])
  useRefreshOnFocus(() => { if (profile) load(true) })

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const monthStart = currentMonthStart()

    const [{ data: settingsData }, { data: signupsData }, { data: openData }] = await Promise.all([
      supabase.from('studio_settings').select('*').eq('id', 1).single(),
      supabase.from('monthly_signups')
        .select('*, groups(*)')
        .eq('member_id', profile.id)
        .gte('period', monthStart)
        .order('period'),
      supabase.from('group_signup_periods')
        .select('*, groups(*)')
        .eq('is_open', true)
        .gte('period', monthStart)
        .order('period')
    ])
    const signups = signupsData || []
    setMySignups(signups)

    // periodi u kojima je član već prijavljen se ne nude ponovo
    const signedPeriods = new Set(signups.map(s => s.period))
    const offerRows = (openData || []).filter(r =>
      !signedPeriods.has(r.period) && r.groups && r.groups.active && !r.groups.archived
    )

    const offersByPeriod = {}
    for (const r of offerRows) {
      let full = false
      if (r.groups.capacity != null) {
        const { data: count } = await supabase.rpc('count_monthly_signups', {
          p_group_id: r.group_id,
          p_period: r.period
        })
        full = (count || 0) >= r.groups.capacity
      }
      if (!offersByPeriod[r.period]) offersByPeriod[r.period] = []
      offersByPeriod[r.period].push({ group: r.groups, full })
    }
    setOpenOffers(
      Object.entries(offersByPeriod)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([period, groups]) => ({ period, groups }))
    )

    // rasporedi termina za sve grupe koje prikazujemo
    const groupIds = new Set([
      ...signups.map(s => s.group_id),
      ...offerRows.map(r => r.group_id)
    ])
    const scheduleMap = {}
    if (groupIds.size > 0) {
      const { data: scheduleRows } = await supabase
        .from('group_schedule').select('*').in('group_id', [...groupIds]).order('weekday')
      for (const s of scheduleRows || []) {
        if (!scheduleMap[s.group_id]) scheduleMap[s.group_id] = []
        scheduleMap[s.group_id].push(`${WEEKDAY_NAMES[s.weekday]} ${s.start_time.slice(0, 5)}h`)
      }
    }
    setScheduleByGroup(scheduleMap)

    const qrMap = {}
    if (settingsData) {
      for (const s of signups) {
        if (s.status === 'due') {
          const str = buildIpsQrString({
            accountNumber: settingsData.account_number,
            recipientName: settingsData.recipient_name,
            amount: s.amount,
            purposeCode: settingsData.purpose_code,
            refCode: s.ref_code
          })
          qrMap[s.id] = await QRCode.toDataURL(str, { margin: 1, width: 220 })
        }
      }
    }
    setQrById(qrMap)
    setLoading(false)
  }

  async function handleSignup(group, period) {
    setError('')
    setBusyKey(`${group.id}:${period}`)
    const { error: err } = await supabase.from('monthly_signups').insert({
      group_id: group.id,
      member_id: profile.id,
      period,
      amount: group.monthly_price,
      ref_code: makeRefCode(period, profile.id),
      status: 'due'
    })
    if (err) {
      setError(err.code === '23505'
        ? 'Već si prijavljena u jednu grupu za taj mesec.'
        : 'Došlo je do greške. Pokušaj ponovo.')
    }
    await load(true)
    setBusyKey(null)
  }

  async function handleCancel(signup) {
    if (!confirm('Poništiti prijavu?')) return
    const { data, error: err } = await supabase
      .from('monthly_signups').delete().eq('id', signup.id).select()
    if (err) alert('Greška: ' + err.message)
    else if (!data || data.length === 0) alert('Prijava nije poništena (možda je uplata već potvrđena).')
    await load(true)
  }

  if (loading) return <p>Učitavanje...</p>

  const monthStart = currentMonthStart()

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Redovna joga</h3>

      {mySignups.map(s => (
        <div key={s.id} style={{ borderBottom: '1px solid #eee', paddingBottom: 12, marginBottom: 12 }}>
          <p style={{ margin: '0 0 2px', fontSize: 12, color: '#666' }}>
            {s.period === monthStart ? 'Ovaj mesec' : 'Sledeći mesec'} · {monthLabel(s.period)}
          </p>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
            {s.groups?.name}
            {scheduleByGroup[s.group_id] && ` · ${scheduleByGroup[s.group_id].join(', ')}`}
          </p>
          {s.status === 'paid' && (
            <p style={{ color: 'green', fontWeight: 700, margin: 0 }}>
              ✓ Prijavljena si i uplata je potvrđena
            </p>
          )}
          {s.status === 'due' && (
            <div>
              <p style={{ margin: '0 0 8px' }}>
                Prijavljena si. Čeka se uplata ({s.amount} RSD). Poziv na broj: {s.ref_code}
              </p>
              {qrById[s.id] && <img src={qrById[s.id]} alt="IPS QR kod" width={220} height={220} />}
              <div>
                <button onClick={() => handleCancel(s)} style={{ marginTop: 8 }}>Poništi prijavu</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {openOffers.map(({ period, groups }) => (
        <div key={period} style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>
            Otvorene prijave za {monthLabel(period)}
          </p>
          {groups.map(({ group, full }) => (
            <div key={group.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <p style={{ margin: '0 0 2px', fontWeight: 600 }}>{group.name}</p>
              {scheduleByGroup[group.id] && (
                <p style={{ margin: '0 0 2px', fontSize: 13, color: '#555' }}>
                  {scheduleByGroup[group.id].join(', ')}
                </p>
              )}
              {group.description_short && (
                <p style={{ margin: '0 0 4px', fontSize: 13 }}>{group.description_short}</p>
              )}
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>{group.monthly_price} RSD</p>
              {full
                ? <p style={{ margin: 0, color: '#a33', fontWeight: 600 }}>Grupa je popunjena</p>
                : <button onClick={() => handleSignup(group, period)}
                    disabled={busyKey === `${group.id}:${period}`}>Prijavi se</button>}
            </div>
          ))}
        </div>
      ))}

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {mySignups.length === 0 && openOffers.length === 0 && (
        <p style={{ color: '#666', margin: 0 }}>
          Trenutno nema otvorenih prijava za redovnu jogu. Obavestićemo te kad se otvore.
        </p>
      )}
    </div>
  )
}
