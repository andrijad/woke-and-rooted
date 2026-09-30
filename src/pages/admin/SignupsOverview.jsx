import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatEventDates } from '../../lib/events'

function nextMonthValue() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

export default function SignupsOverview() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [busyGroupId, setBusyGroupId] = useState(null)

  const [groups, setGroups] = useState([])
  const [periodsByGroup, setPeriodsByGroup] = useState({})
  const [signupsByGroup, setSignupsByGroup] = useState({})
  const [monthInputByGroup, setMonthInputByGroup] = useState({})
  const [showArchivedGroups, setShowArchivedGroups] = useState(false)

  const [events, setEvents] = useState([])
  const [eventSignups, setEventSignups] = useState({})
  const [showArchivedEvents, setShowArchivedEvents] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    await loadGroupsAndPeriods()
    await loadEvents()
    setLoading(false)
  }

  async function loadGroupsAndPeriods() {
    const { data: groupsData } = await supabase.from('groups').select('*').order('name')
    const list = groupsData || []
    setGroups(list)
    if (list.length === 0) return

    const ids = list.map(g => g.id)
    const [{ data: periodsData }, { data: signupsData }] = await Promise.all([
      supabase.from('group_signup_periods').select('*').in('group_id', ids).order('period', { ascending: false }),
      supabase.from('monthly_signups')
        .select('id, group_id, period, amount, status, ref_code, profiles(full_name)')
        .in('group_id', ids)
        .order('period', { ascending: false })
    ])

    const periodsMap = {}
    for (const p of periodsData || []) {
      if (!periodsMap[p.group_id]) periodsMap[p.group_id] = []
      periodsMap[p.group_id].push(p)
    }
    setPeriodsByGroup(periodsMap)

    const signupsMap = {}
    for (const s of signupsData || []) {
      if (!signupsMap[s.group_id]) signupsMap[s.group_id] = []
      signupsMap[s.group_id].push(s)
    }
    setSignupsByGroup(signupsMap)

    setMonthInputByGroup(prev => {
      const next = { ...prev }
      for (const g of list) if (!next[g.id]) next[g.id] = nextMonthValue()
      return next
    })
  }

  async function loadEvents() {
    const { data } = await supabase.from('events').select('*').order('date_from', { ascending: false })
    const list = data || []
    setEvents(list)
    if (list.length > 0) {
      const { data: signupsData } = await supabase
        .from('event_signups')
        .select('id, event_id, amount, status, ref_code, added_by_admin, profiles(full_name)')
        .in('event_id', list.map(e => e.id))
      const grouped = {}
      for (const s of signupsData || []) {
        if (!grouped[s.event_id]) grouped[s.event_id] = []
        grouped[s.event_id].push(s)
      }
      setEventSignups(grouped)
    }
  }

  async function openGroupPeriod(groupId) {
    const monthVal = monthInputByGroup[groupId]
    if (!monthVal) return
    const period = `${monthVal}-01`
    const existing = (periodsByGroup[groupId] || []).find(p => p.period === period)
    setBusyGroupId(groupId)
    let err = null
    if (existing) {
      if (existing.is_open) {
        alert('Prijave za taj mesec su već otvorene.')
        setBusyGroupId(null)
        return
      }
      const { error } = await supabase
        .from('group_signup_periods')
        .update({ is_open: true, closed_at: null })
        .eq('id', existing.id)
      err = error
    } else {
      const { error } = await supabase
        .from('group_signup_periods')
        .insert({ group_id: groupId, period, opened_by: profile.id })
      err = error
    }
    if (err) alert('Greška: ' + err.message)
    await loadGroupsAndPeriods()
    setBusyGroupId(null)
  }

  async function closeGroupPeriod(periodRow) {
    setBusyGroupId(periodRow.group_id)
    const { error } = await supabase
      .from('group_signup_periods')
      .update({ is_open: false, closed_at: new Date().toISOString() })
      .eq('id', periodRow.id)
    if (error) alert('Greška: ' + error.message)
    await loadGroupsAndPeriods()
    setBusyGroupId(null)
  }

  async function toggleMonthlyPaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('monthly_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await loadGroupsAndPeriods()
  }

  async function toggleEventPaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('event_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await loadEvents()
  }

  if (loading) return <p>Učitavanje...</p>

  const visibleGroups = groups
    .filter(g => showArchivedGroups || !g.archived)
    .slice()
    .sort((a, b) => {
      const pa = periodsByGroup[a.id]?.[0]?.period || ''
      const pb = periodsByGroup[b.id]?.[0]?.period || ''
      if (pa === pb) return a.name.localeCompare(b.name)
      return pa < pb ? 1 : -1 // opadajuće — najnoviji period prvi, bez perioda na kraju
    })

  const visibleEvents = events.filter(ev => showArchivedEvents || !ev.archived)

  return (
    <div>
      <h3 style={{ fontSize: 16 }}>Redovna joga</h3>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" checked={showArchivedGroups} onChange={e => setShowArchivedGroups(e.target.checked)} /> Prikaži arhivirane grupe
      </label>

      {visibleGroups.length === 0 && <p style={{ fontSize: 13, color: '#666' }}>Nema grupa.</p>}

      {visibleGroups.map(g => {
        const periods = periodsByGroup[g.id] || []
        const latest = periods[0] || null
        const rows = signupsByGroup[g.id] || []
        return (
          <div key={g.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 4px' }}>
              {g.name}
              {g.archived && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>arhivirano</span>}
            </h4>

            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {latest
                ? (latest.is_open
                    ? <span style={{ color: 'green', fontWeight: 600 }}>Otvoreno za {latest.period}</span>
                    : <span style={{ color: '#a33', fontWeight: 600 }}>Zatvoreno (poslednji period: {latest.period})</span>)
                : <span style={{ color: '#666' }}>Nikad otvarano</span>}
            </p>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <input type="month" value={monthInputByGroup[g.id] || ''}
                onChange={e => setMonthInputByGroup({ ...monthInputByGroup, [g.id]: e.target.value })} />
              <button onClick={() => openGroupPeriod(g.id)} disabled={busyGroupId === g.id}>Otvori prijave</button>
              {latest && latest.is_open && (
                <button onClick={() => closeGroupPeriod(latest)} disabled={busyGroupId === g.id}>Zatvori prijave</button>
              )}
            </div>

            {rows.length === 0 && <p style={{ fontSize: 13, color: '#666' }}>Još nema prijava.</p>}
            {rows.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8 }}>{r.profiles?.full_name || '—'}</td>
                      <td style={{ padding: 8, fontSize: 12, color: '#666' }}>{r.period}</td>
                      <td style={{ padding: 8 }}>{r.amount} RSD</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => toggleMonthlyPaid(r)}>
                          {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      <h3 style={{ fontSize: 16, marginTop: 32 }}>Događaji</h3>
      <label style={{ display: 'block', fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" checked={showArchivedEvents} onChange={e => setShowArchivedEvents(e.target.checked)} /> Prikaži arhivirane
      </label>

      {visibleEvents.length === 0 && <p style={{ fontSize: 13, color: '#666' }}>Nema događaja.</p>}

      {visibleEvents.map(ev => {
        const signups = eventSignups[ev.id] || []
        return (
          <div key={ev.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <h4 style={{ margin: '0 0 4px' }}>
              {ev.name}
              {!ev.published && <span style={{ fontSize: 12, color: '#a67', marginLeft: 8 }}>nacrt</span>}
              {ev.archived && <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>arhivirano</span>}
            </h4>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#555' }}>
              {formatEventDates(ev)} · {ev.price} RSD
              {ev.capacity != null && ` · ${signups.length}/${ev.capacity} prijavljeno`}
            </p>
            {signups.length === 0 && <p style={{ fontSize: 13, color: '#666' }}>Još nema prijava.</p>}
            {signups.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {signups.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8 }}>{s.profiles?.full_name || '—'}{s.added_by_admin && ' (dodala vlasnica)'}</td>
                      <td style={{ padding: 8 }}>{s.amount} RSD</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => toggleEventPaid(s)}>
                          {s.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}