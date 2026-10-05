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

function currentMonthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function monthLabel(period) {
  const t = new Date(period + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
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
    let err
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

  async function removeMonthly(row) {
    if (!confirm(`Ukloniti prijavu za ${row.profiles?.full_name || 'ovog člana'} (${row.period})?`)) return
    const { error } = await supabase.from('monthly_signups').delete().eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await loadGroupsAndPeriods()
  }

  async function removeEventSignup(row) {
    if (!confirm(`Ukloniti prijavu za ${row.profiles?.full_name || 'ovog člana'}?`)) return
    const { error } = await supabase.from('event_signups').delete().eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await loadEvents()
  }

  async function toggleEventPaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('event_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await loadEvents()
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  const thisMonth = currentMonthStart()

  const visibleGroups = groups
    .filter(g => showArchivedGroups || !g.archived)
    .slice()
    .sort((a, b) => {
      const oa = (periodsByGroup[a.id] || []).some(p => p.is_open) ? 0 : 1
      const ob = (periodsByGroup[b.id] || []).some(p => p.is_open) ? 0 : 1
      if (oa !== ob) return oa - ob
      return a.name.localeCompare(b.name)
    })

  const visibleEvents = events.filter(ev => showArchivedEvents || !ev.archived)

  return (
    <div>
      <div className="section-title"><img src="/brand/yoga.svg" alt="" /><h3>Redovna joga</h3></div>
      <label className="check small mb">
        <input type="checkbox" checked={showArchivedGroups} onChange={e => setShowArchivedGroups(e.target.checked)} /> Prikaži arhivirane grupe
      </label>

      {visibleGroups.length === 0 && <p className="small muted">Nema grupa.</p>}

      {visibleGroups.map(g => {
        const periods = periodsByGroup[g.id] || []
        const openPeriods = periods.filter(p => p.is_open).sort((x, y) => (x.period < y.period ? -1 : 1))
        const rows = signupsByGroup[g.id] || []

        const byPeriod = {}
        for (const r of rows) {
          if (!byPeriod[r.period]) byPeriod[r.period] = []
          byPeriod[r.period].push(r)
        }
        const stats = period => {
          const list = byPeriod[period] || []
          return { list, total: list.length, paid: list.filter(r => r.status === 'paid').length }
        }
        const capText = total => (g.capacity != null ? `${total}/${g.capacity}` : `${total}`)

        // periodi koji se prikazuju u glavnom delu: tekući + otvoreni + budući sa prijavama
        const mainSet = new Set([thisMonth, ...openPeriods.map(p => p.period)])
        for (const per of Object.keys(byPeriod)) if (per >= thisMonth) mainSet.add(per)
        const mainPeriods = [...mainSet].sort().reverse()
        const olderPeriods = Object.keys(byPeriod).filter(per => !mainSet.has(per)).sort().reverse()

        const renderTable = list => (
          <div className="scroll-x"><table>
            <tbody>
              {list.map(r => (
                <tr key={r.id}>
                  <td>{r.profiles?.full_name || '—'}</td>
                  <td>{r.amount} RSD</td>
                  <td className="small muted">Poziv: <span className="strong">{r.ref_code}</span></td>
                  <td>
                    <button className={r.status === 'paid' ? 'btn-sm' : 'btn-ghost btn-sm'} onClick={() => toggleMonthlyPaid(r)}>
                      {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                    </button>
                  </td>
                  <td>
                    <button className="btn-danger btn-sm" onClick={() => removeMonthly(r)}>Ukloni</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )

        return (
          <div key={g.id} className="card">
            <h4>
              {g.name}
              {g.archived && <span className="badge" style={{ marginLeft: 8 }}>arhivirano</span>}
            </h4>

            {/* Prijave: koji su meseci otvoreni */}
            <div className="notice mb">
              <p className="small strong" style={{ margin: '0 0 6px' }}>Prijave</p>
              {openPeriods.length === 0 && (
                <p className="small error" style={{ margin: 0 }}>Trenutno nijedan mesec nije otvoren za prijave.</p>
              )}
              {openPeriods.map(p => {
                const st = stats(p.period)
                return (
                  <div key={p.id} className="row" style={{ marginBottom: 6 }}>
                    <span className="badge moss">● Otvoreno: {monthLabel(p.period)}</span>
                    <span className="xs muted">{capText(st.total)} prijavljeno</span>
                    <button className="btn-ghost btn-sm" onClick={() => closeGroupPeriod(p)} disabled={busyGroupId === g.id}>Zatvori prijave</button>
                  </div>
                )
              })}
              <div className="row mt">
                <input type="month" value={monthInputByGroup[g.id] || ''}
                  onChange={e => setMonthInputByGroup({ ...monthInputByGroup, [g.id]: e.target.value })} />
                <button onClick={() => openGroupPeriod(g.id)} disabled={busyGroupId === g.id}>Otvori prijave</button>
              </div>
            </div>

            {/* Tekući i otvoreni meseci */}
            {mainPeriods.map(per => {
              const st = stats(per)
              const isCurrent = per === thisMonth
              const isOpen = openPeriods.some(p => p.period === per)
              return (
                <div key={per} className="mb">
                  <p className="strong" style={{ margin: '0 0 2px' }}>
                    {monthLabel(per)}
                    {isCurrent && <span className="xs muted"> · tekući mesec</span>}
                    {isOpen && <span className="xs success"> · otvoreno za prijave</span>}
                  </p>
                  <p className="xs muted" style={{ margin: '0 0 4px' }}>
                    {capText(st.total)} prijavljeno · {st.paid} plaćeno
                  </p>
                  {st.total === 0
                    ? <p className="small muted" style={{ margin: 0 }}>Još nema prijava.</p>
                    : renderTable(st.list)}
                </div>
              )
            })}

            {olderPeriods.length > 0 && (
              <details>
                <summary>Ranije ({olderPeriods.length})</summary>
                {olderPeriods.map(per => {
                  const st = stats(per)
                  return (
                    <div key={per} className="mt">
                      <p className="small strong" style={{ margin: '0 0 4px' }}>
                        {monthLabel(per)} <span className="muted" style={{ fontWeight: 400 }}>· {st.total} prijavljeno · {st.paid} plaćeno</span>
                      </p>
                      {renderTable(st.list)}
                    </div>
                  )
                })}
              </details>
            )}
          </div>
        )
      })}

      <div className="section-title section"><img src="/brand/cocoa.svg" alt="" /><h3>Događaji</h3></div>
      <label className="check small mb">
        <input type="checkbox" checked={showArchivedEvents} onChange={e => setShowArchivedEvents(e.target.checked)} /> Prikaži arhivirane
      </label>

      {visibleEvents.length === 0 && <p className="small muted">Nema događaja.</p>}

      {visibleEvents.map(ev => {
        const signups = eventSignups[ev.id] || []
        return (
          <div key={ev.id} className="card">
            <h4 style={{ marginBottom: 4 }}>
              {ev.name}
              {!ev.published && <span className="badge clay" style={{ marginLeft: 8 }}>nacrt</span>}
              {ev.archived && <span className="badge" style={{ marginLeft: 8 }}>arhivirano</span>}
            </h4>
            <p className="small muted">
              {formatEventDates(ev)} · {ev.price} RSD
              {ev.capacity != null && ` · ${signups.length}/${ev.capacity} prijavljeno`}
            </p>
            {signups.length === 0 && <p className="small muted">Još nema prijava.</p>}
            {signups.length > 0 && (
              <div className="scroll-x"><table>
                <tbody>
                  {signups.map(s => (
                    <tr key={s.id}>
                      <td>{s.profiles?.full_name || '—'}{s.added_by_admin && ' (dodala vlasnica)'}</td>
                      <td>{s.amount} RSD</td>
                      <td className="small muted">Poziv: <span className="strong">{s.ref_code}</span></td>
                      <td>
                        <button className={s.status === 'paid' ? 'btn-sm' : 'btn-ghost btn-sm'} onClick={() => toggleEventPaid(s)}>
                          {s.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                        </button>
                      </td>
                      <td>
                        <button className="btn-danger btn-sm" onClick={() => removeEventSignup(s)}>Ukloni</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        )
      })}
    </div>
  )
}
