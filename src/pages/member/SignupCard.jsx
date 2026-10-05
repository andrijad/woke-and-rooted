import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import PaymentDetails from './PaymentDetails'
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
  const [settings, setSettings] = useState(null)
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

    setSettings(settingsData || null)
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

  if (loading) return <p className="muted">Učitavanje...</p>

  const monthStart = currentMonthStart()

  return (
    <section className="section">
      <div className="section-title">
        <img src="/brand/yoga.svg" alt="" />
        <h3>Redovna joga</h3>
      </div>

      {mySignups.map(s => (
        <div key={s.id} className={`signup ${s.status === 'paid' ? 'is-paid' : 'is-due'}`}>
          <p className="when">
            {s.period === monthStart ? 'Ovaj mesec' : 'Sledeći mesec'} · {monthLabel(s.period)}
          </p>
          <h4>{s.groups?.name}</h4>
          {scheduleByGroup[s.group_id] && (
            <p className="small" style={{ margin: '0 0 8px' }}>{scheduleByGroup[s.group_id].join(', ')}</p>
          )}
          {s.status === 'paid' && (
            <p className="strong" style={{ margin: 0 }}>✓ Prijavljena si i uplata je potvrđena</p>
          )}
          {s.status === 'due' && (
            <div>
              <p style={{ margin: 0 }}>
                <span className="strong">Prijavljena si — čeka se uplata.</span>
              </p>
              <PaymentDetails settings={settings} amount={s.amount} refCode={s.ref_code} />
              <button className="btn-ghost btn-sm" onClick={() => handleCancel(s)}>Poništi prijavu</button>
            </div>
          )}
        </div>
      ))}

      {openOffers.map(({ period, groups }) => (
        <div key={period} className="mb">
          <p className="strong" style={{ margin: '0 0 8px' }}>
            Otvorene prijave za {monthLabel(period)}
          </p>
          {groups.map(({ group, full }) => (
            <div key={group.id} className="offer">
              <h4>{group.name}</h4>
              {scheduleByGroup[group.id] && (
                <p className="small muted" style={{ margin: '0 0 4px' }}>
                  {scheduleByGroup[group.id].join(', ')}
                </p>
              )}
              {group.description_short && (
                <p className="small" style={{ margin: '0 0 6px' }}>{group.description_short}</p>
              )}
              <p className="price" style={{ margin: '0 0 10px' }}>{group.monthly_price} RSD</p>
              {full
                ? <span className="badge clay">Grupa je popunjena</span>
                : <button onClick={() => handleSignup(group, period)}
                    disabled={busyKey === `${group.id}:${period}`}>Prijavi se</button>}
            </div>
          ))}
        </div>
      ))}

      {error && <p className="error">{error}</p>}

      {mySignups.length === 0 && openOffers.length === 0 && (
        <div className="empty">
          <img src="/brand/nature.svg" alt="" />
          <p>Trenutno nema otvorenih prijava za redovnu jogu. Obavestićemo te kad se otvore.</p>
        </div>
      )}
    </section>
  )
}
