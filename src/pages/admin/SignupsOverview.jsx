import { errMsg } from '../../lib/errors'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatEventDates, isPastEvent, todayLocal } from '../../lib/events'
import { ownerName } from '../../lib/names'

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

function SignupTable({ rows, onPaid, onRemove }) {
  return (
    <div className="scroll-x"><table>
      <tbody>
        {rows.map(r => (
          <tr key={r.id}>
            <td>{ownerName(r.profiles)}{r.added_by_admin && ' (dodala vlasnica)'}</td>
            <td className="small muted">Poziv: <span className="strong">{r.ref_code}</span></td>
            <td>
              <button className={r.status === 'paid' ? 'btn-sm' : 'btn-ghost btn-sm'} onClick={() => onPaid(r)}>
                {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
              </button>
            </td>
            <td>
              <button className="btn-danger btn-sm" onClick={() => onRemove(r)}>Ukloni</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

// Masovno obaveštenje: „prijave za MESEC su otvorene“ (notifikacija + mejl svim članovima).
function AnnounceMonth({ groups, periodsByGroup }) {
  const [sent, setSent] = useState({})
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('announcements').select('ref, sent_at, recipients')
        .eq('kind', 'month_open').order('sent_at', { ascending: false })
      if (cancelled) return
      const map = {}
      for (const a of data || []) if (!map[a.ref]) map[a.ref] = a
      setSent(map)
    }
    load()
    return () => { cancelled = true }
  }, [tick])

  const thisMonth = currentMonthStart()
  const activeIds = new Set(groups.filter(g => g.active).map(g => g.id))
  const months = [...new Set(Object.entries(periodsByGroup)
    .filter(([gid]) => activeIds.has(gid))
    .flatMap(([, list]) => list.filter(pr => pr.is_open && pr.period >= thisMonth).map(pr => pr.period)))].sort()
  const selected = choice && months.includes(choice) ? choice : months[0] || ''

  async function send() {
    if (!selected) return
    const prev = sent[selected]
    const q = prev
      ? `Obaveštenje za ${monthLabel(selected)} je već poslato ${new Date(prev.sent_at).toLocaleDateString('sr-Latn-RS')}. Poslati ponovo svim članovima?`
      : `Poslati svim članovima obaveštenje (notifikacija i mejl) da su prijave za ${monthLabel(selected)} otvorene?`
    if (!confirm(q)) return
    setBusy(true); setMsg('')
    const { data, error } = await supabase.rpc('admin_announce_month', { p_period: selected })
    setBusy(false)
    if (error) { setMsg('Greška: ' + errMsg(error)); return }
    setMsg(`Poslato. Mejl ide ka ${data} članova (u narednih nekoliko minuta).`)
    setTick(t => t + 1)
  }

  return (
    <div className="notice mb">
      <p className="small strong" style={{ margin: '0 0 6px' }}>Obavesti članove</p>
      {months.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>Kad otvoriš prijave za neki mesec, ovde možeš da obavestiš sve članove.</p>
      ) : (
        <>
          <div className="row">
            <select value={selected} onChange={e => setChoice(e.target.value)}>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button onClick={send} disabled={busy}>Obavesti da su prijave otvorene</button>
          </div>
          {sent[selected] && (
            <p className="xs muted" style={{ margin: '6px 0 0' }}>
              Već poslato {new Date(sent[selected].sent_at).toLocaleDateString('sr-Latn-RS')} ({sent[selected].recipients} mejlova).
            </p>
          )}
        </>
      )}
      {msg && <p className="small" style={{ margin: '6px 0 0' }}>{msg}</p>}
    </div>
  )
}

export default function SignupsOverview() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [busyGroupId, setBusyGroupId] = useState(null)

  const [groups, setGroups] = useState([])
  const [periodsByGroup, setPeriodsByGroup] = useState({})
  const [allMonthly, setAllMonthly] = useState([])
  const [monthInputByGroup, setMonthInputByGroup] = useState({})
  const [showInactiveGroups, setShowInactiveGroups] = useState(false)

  const [events, setEvents] = useState([])
  const [eventSignups, setEventSignups] = useState([])
  const [showInactiveEvents, setShowInactiveEvents] = useState(false)

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
    const [{ data: periodsData }, { data: signupsData }] = await Promise.all([
      supabase.from('group_signup_periods').select('*').order('period', { ascending: false }),
      supabase.from('monthly_signups')
        .select('id, group_id, group_name, period, status, ref_code, profiles(full_name, nickname)')
        .order('period', { ascending: false })
    ])

    const periodsMap = {}
    for (const p of periodsData || []) {
      if (!periodsMap[p.group_id]) periodsMap[p.group_id] = []
      periodsMap[p.group_id].push(p)
    }
    setPeriodsByGroup(periodsMap)

    setAllMonthly(signupsData || [])

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
    const { data: signupsData } = await supabase
      .from('event_signups')
      .select('id, event_id, event_name, event_date_from, event_date_to, status, ref_code, added_by_admin, profiles(full_name, nickname)')
    setEventSignups(signupsData || [])
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
    if (err) alert('Greška: ' + errMsg(err))
    await loadGroupsAndPeriods()
    setBusyGroupId(null)
  }

  async function closeGroupPeriod(periodRow) {
    setBusyGroupId(periodRow.group_id)
    const { error } = await supabase
      .from('group_signup_periods')
      .update({ is_open: false, closed_at: new Date().toISOString() })
      .eq('id', periodRow.id)
    if (error) alert('Greška: ' + errMsg(error))
    await loadGroupsAndPeriods()
    setBusyGroupId(null)
  }

  async function toggleMonthlyPaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('monthly_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + errMsg(error))
    await loadGroupsAndPeriods()
  }

  async function removeMonthly(row) {
    if (!confirm(`Ukloniti prijavu za ${ownerName(row.profiles, 'ovog člana')} (${row.period})?`)) return
    const { error } = await supabase.from('monthly_signups').delete().eq('id', row.id)
    if (error) alert('Greška: ' + errMsg(error))
    await loadGroupsAndPeriods()
  }

  async function removeEventSignup(row) {
    if (!confirm(`Ukloniti prijavu za ${ownerName(row.profiles, 'ovog člana')}?`)) return
    const { error } = await supabase.from('event_signups').delete().eq('id', row.id)
    if (error) alert('Greška: ' + errMsg(error))
    await loadEvents()
  }

  async function toggleEventPaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('event_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + errMsg(error))
    await loadEvents()
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  const thisMonth = currentMonthStart()
  const today = todayLocal()
  const groupsById = Object.fromEntries(groups.map(g => [g.id, g]))
  const eventsById = Object.fromEntries(events.map(ev => [ev.id, ev]))

  const signupsByGroup = {}
  const oldMonthly = []
  for (const r of allMonthly) {
    if (r.group_id && groupsById[r.group_id] && r.period >= thisMonth) {
      if (!signupsByGroup[r.group_id]) signupsByGroup[r.group_id] = []
      signupsByGroup[r.group_id].push(r)
    } else {
      oldMonthly.push(r)
    }
  }

  const visibleGroups = groups
    .filter(g => showInactiveGroups || g.active)
    .slice()
    .sort((a, b) => {
      const oa = (periodsByGroup[a.id] || []).some(p => p.is_open) ? 0 : 1
      const ob = (periodsByGroup[b.id] || []).some(p => p.is_open) ? 0 : 1
      if (oa !== ob) return oa - ob
      return a.name.localeCompare(b.name)
    })

  const upcomingEvents = events
    .filter(ev => !isPastEvent(ev, today) && (showInactiveEvents || ev.active))
    .slice()
    .sort((a, b) => (a.date_from < b.date_from ? -1 : 1))

  // Evidencija: prethodni meseci (po mesecu pa po grupi) i prethodni događaji (uključujući obrisane)
  const monthsMap = {}
  for (const r of oldMonthly) {
    const g = r.group_id && groupsById[r.group_id]
    const label = (g && g.name) || r.group_name || 'Obrisana grupa'
    const key = r.group_id || `del:${label}`
    if (!monthsMap[r.period]) monthsMap[r.period] = {}
    if (!monthsMap[r.period][key]) monthsMap[r.period][key] = { label, rows: [] }
    monthsMap[r.period][key].rows.push(r)
  }
  const oldPeriods = Object.keys(monthsMap).sort().reverse()

  const pastEventsMap = {}
  for (const sg of eventSignups) {
    const ev = sg.event_id && eventsById[sg.event_id]
    const info = ev
      ? { name: ev.name, date_from: ev.date_from, date_to: ev.date_to }
      : { name: sg.event_name || 'Obrisan događaj', date_from: sg.event_date_from, date_to: sg.event_date_to }
    if (!isPastEvent(info, today)) continue
    const key = sg.event_id || `del:${info.name}:${info.date_from}`
    if (!pastEventsMap[key]) pastEventsMap[key] = { info, rows: [] }
    pastEventsMap[key].rows.push(sg)
  }
  // prošli događaji bez prijava se ne prikazuju u evidenciji
  const pastEventList = Object.values(pastEventsMap).sort((a, b) => ((a.info.date_from || '') < (b.info.date_from || '') ? 1 : -1))
  const paidCount = list => list.filter(x => x.status === 'paid').length

  return (
    <div>
      <div className="section-title"><img src="/brand/yoga.svg" alt="" /><h3>Redovna joga</h3></div>
      <AnnounceMonth groups={groups} periodsByGroup={periodsByGroup} />
      <label className="check small mb">
        <input type="checkbox" checked={showInactiveGroups} onChange={e => setShowInactiveGroups(e.target.checked)} /> Prikaži neaktivne grupe
      </label>

      {visibleGroups.length === 0 && <p className="small muted">Nema aktivnih grupa.</p>}

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
          return { list, total: list.length, paid: paidCount(list) }
        }
        const capText = total => (g.capacity != null ? `${total}/${g.capacity}` : `${total}`)

        // periodi koji se prikazuju: tekući + otvoreni + budući sa prijavama
        const mainSet = new Set([thisMonth, ...openPeriods.filter(p => p.period >= thisMonth).map(p => p.period)])
        for (const per of Object.keys(byPeriod)) mainSet.add(per)
        const mainPeriods = [...mainSet].sort().reverse()

        return (
          <div key={g.id} className="card">
            <h4>
              {g.name}
              {!g.active && <span className="badge" style={{ marginLeft: 8 }}>neaktivno</span>}
            </h4>
            <p className="small muted">{g.monthly_price} RSD mesečno</p>

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
                    : <SignupTable rows={st.list} onPaid={toggleMonthlyPaid} onRemove={removeMonthly} />}
                </div>
              )
            })}
          </div>
        )
      })}

      <div className="section-title section"><img src="/brand/cocoa.svg" alt="" /><h3>Događaji</h3></div>
      <label className="check small mb">
        <input type="checkbox" checked={showInactiveEvents} onChange={e => setShowInactiveEvents(e.target.checked)} /> Prikaži neaktivne događaje
      </label>

      {upcomingEvents.length === 0 && <p className="small muted">Nema predstojećih događaja.</p>}

      {upcomingEvents.map(ev => {
        const signups = eventSignups.filter(x => x.event_id === ev.id)
        return (
          <div key={ev.id} className="card">
            <h4 style={{ marginBottom: 4 }}>
              {ev.name}
              {!ev.active && <span className="badge" style={{ marginLeft: 8 }}>neaktivno</span>}
            </h4>
            <p className="small muted">
              {formatEventDates(ev)} · {ev.price} RSD
              {ev.capacity != null && ` · ${signups.length}/${ev.capacity} prijavljeno`}
            </p>
            {signups.length === 0 && <p className="small muted">Još nema prijava.</p>}
            {signups.length > 0 && <SignupTable rows={signups} onPaid={toggleEventPaid} onRemove={removeEventSignup} />}
          </div>
        )
      })}

      <div className="section-title section"><h3>Evidencija prethodnih termina</h3></div>
      <p className="small muted">Svi prošli meseci joge i prošli događaji (i obrisani) sa prijavama. Ovde možeš da potvrdiš uplatu ili ukloniš prijavu zbog ispravke.</p>

      <details className="card">
        <summary>Prethodni meseci joge ({oldPeriods.length})</summary>
        {oldPeriods.length === 0 && <p className="small muted mt">Nema evidencije.</p>}
        {oldPeriods.map(per => (
          <div key={per} className="mt">
            <p className="strong" style={{ margin: '0 0 4px' }}>{monthLabel(per)}</p>
            {Object.values(monthsMap[per]).sort((a, b) => a.label.localeCompare(b.label)).map(grp => (
              <div key={grp.label} className="mb">
                <p className="small" style={{ margin: '0 0 4px' }}>
                  <span className="strong">{grp.label}</span>
                  <span className="muted"> · {grp.rows.length} prijavljeno · {paidCount(grp.rows)} plaćeno</span>
                </p>
                <SignupTable rows={grp.rows} onPaid={toggleMonthlyPaid} onRemove={removeMonthly} />
              </div>
            ))}
          </div>
        ))}
      </details>

      <details className="card">
        <summary>Prethodni događaji ({pastEventList.length})</summary>
        {pastEventList.length === 0 && <p className="small muted mt">Nema evidencije.</p>}
        {pastEventList.map(({ info, rows }) => (
          <div key={rows[0].event_id || `${info.name}${info.date_from}`} className="mt">
            <p className="small" style={{ margin: '0 0 4px' }}>
              <span className="strong">{info.name}</span>
              <span className="muted"> · {formatEventDates(info)} · {rows.length} prijavljeno · {paidCount(rows)} plaćeno</span>
            </p>
            <SignupTable rows={rows} onPaid={toggleEventPaid} onRemove={removeEventSignup} />
          </div>
        ))}
      </details>
    </div>
  )
}
