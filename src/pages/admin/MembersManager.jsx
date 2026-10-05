import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { makeDropinRefCode, makeEventRefCode, makeRefCode } from '../../lib/ips'
import { computeUpcomingSessions, formatSessionLabel } from '../../lib/schedule'
import { formatEventDates } from '../../lib/events'
import AddMemberForm from './AddMemberForm'

function monthStart(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function monthLabel(period) {
  const t = new Date(period + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function MembersManager() {
  const [members, setMembers] = useState([])
  const [groups, setGroups] = useState([])
  const [events, setEvents] = useState([])
  const [dropinRows, setDropinRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthlyForm, setMonthlyForm] = useState({ member_id: '', group_id: '', month: monthStart().slice(0, 7) })
  const [monthlySaving, setMonthlySaving] = useState(false)
  const [monthlyMessage, setMonthlyMessage] = useState('')

  const [dropinForm, setDropinForm] = useState({ member_id: '', group_id: '', session_date: '' })
  const [dropinSessions, setDropinSessions] = useState([])
  const [dropinSaving, setDropinSaving] = useState(false)
  const [dropinError, setDropinError] = useState('')

  const [eventForm, setEventForm] = useState({ member_id: '', event_id: '' })
  const [eventSaving, setEventSaving] = useState(false)
  const [eventMessage, setEventMessage] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: groupsData }, { data: profilesData }, { data: monthlyData }, { data: eventsData }, { data: dropinData }] =
      await Promise.all([
        supabase.from('groups').select('*').eq('archived', false).order('name'),
        supabase.from('profiles').select('*').eq('is_admin', false).order('full_name'),
        supabase.from('monthly_signups')
          .select('member_id, period, status, groups(name)')
          .gte('period', monthStart())
          .order('period'),
        supabase.from('events').select('*').eq('archived', false).order('date_from', { ascending: false }),
        supabase.from('dropin_signups')
          .select('id, session_date, amount, status, ref_code, added_by_admin, profiles(full_name), groups(name)')
          .order('session_date', { ascending: false })
      ])
    setGroups(groupsData || [])
    setEvents(eventsData || [])
    setDropinRows(dropinData || [])
    const byMember = {}
    for (const r of monthlyData || []) {
      if (!byMember[r.member_id]) byMember[r.member_id] = []
      byMember[r.member_id].push(r)
    }
    setMembers((profilesData || []).map(p => ({ ...p, monthly: byMember[p.id] || [] })))
    setLoading(false)
  }

  async function removeMember(m) {
    if (!confirm(`Ukloniti člana ${m.full_name} iz evidencije?`)) return
    const { data, error } = await supabase.from('profiles').delete().eq('id', m.id).select()
    if (error) {
      alert(error.code === '23503'
        ? 'Član ima prijave. Prvo ukloni njegove prijave u tabu „Termini i uplate".'
        : 'Greška: ' + error.message)
    } else if (!data || data.length === 0) alert('Član nije uklonjen (samo ručno dodati članovi mogu da se uklone).')
    await load()
  }

  async function handleAddMonthly(e) {
    e.preventDefault()
    setMonthlyMessage('')
    if (!monthlyForm.member_id || !monthlyForm.group_id || !monthlyForm.month) return
    setMonthlySaving(true)
    const group = groups.find(g => g.id === monthlyForm.group_id)
    const period = `${monthlyForm.month}-01`
    const { error } = await supabase.from('monthly_signups').insert({
      group_id: monthlyForm.group_id,
      member_id: monthlyForm.member_id,
      period,
      amount: group.monthly_price,
      ref_code: makeRefCode(period, monthlyForm.member_id),
      status: 'due'
    })
    if (error) {
      setMonthlyMessage(error.code === '23505'
        ? 'Član je već prijavljen u neku grupu za taj mesec.'
        : 'Greška: ' + error.message)
    } else {
      setMonthlyMessage('Dodato. Uplatu potvrđuješ u tabu „Termini i uplate".')
      setMonthlyForm({ ...monthlyForm, member_id: '', group_id: '' })
    }
    await load()
    setMonthlySaving(false)
  }

  // --- individualni časovi ---

  async function handleDropinGroupChange(groupId) {
    setDropinForm({ ...dropinForm, group_id: groupId, session_date: '' })
    if (!groupId) { setDropinSessions([]); return }
    const { data } = await supabase.from('group_schedule').select('*').eq('group_id', groupId)
    setDropinSessions(computeUpcomingSessions(data || [], 10))
  }

  async function handleAddDropin(e) {
    e.preventDefault()
    setDropinError('')
    if (!dropinForm.member_id || !dropinForm.group_id || !dropinForm.session_date) return
    setDropinSaving(true)
    const group = groups.find(g => g.id === dropinForm.group_id)
    const refCode = makeDropinRefCode(dropinForm.session_date, dropinForm.member_id, dropinForm.group_id)
    const { error } = await supabase.from('dropin_signups').insert({
      group_id: dropinForm.group_id,
      member_id: dropinForm.member_id,
      session_date: dropinForm.session_date,
      amount: group.dropin_price,
      ref_code: refCode,
      status: 'due',
      added_by_admin: true
    })
    if (error) {
      setDropinError(error.code === '23505'
        ? 'Ovaj član je već prijavljen za izabrani termin.'
        : 'Došlo je do greške. Pokušaj ponovo.')
    } else {
      setDropinForm({ member_id: '', group_id: '', session_date: '' })
      setDropinSessions([])
    }
    await load()
    setDropinSaving(false)
  }

  async function toggleDropinPaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('dropin_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await load()
  }

  async function removeDropin(row) {
    if (!confirm(`Ukloniti prijavu za ${row.profiles?.full_name || 'ovog člana'} (${row.session_date})?`)) return
    const { error } = await supabase.from('dropin_signups').delete().eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await load()
  }

  // --- događaji / radionice ---

  async function handleAddEventSignup(e) {
    e.preventDefault()
    setEventMessage('')
    if (!eventForm.member_id || !eventForm.event_id) return
    setEventSaving(true)
    const ev = events.find(x => x.id === eventForm.event_id)
    const refCode = makeEventRefCode(eventForm.event_id, eventForm.member_id)
    const { error } = await supabase.from('event_signups').insert({
      event_id: eventForm.event_id,
      member_id: eventForm.member_id,
      amount: ev.price,
      ref_code: refCode,
      status: 'due',
      added_by_admin: true
    })
    if (error) {
      setEventMessage(error.code === '23505'
        ? 'Ovaj član je već prijavljen na ovaj događaj.'
        : 'Greška: ' + error.message)
    } else {
      setEventMessage('Dodato. Status uplate je u tabu „Termini i uplate".')
      setEventForm({ member_id: '', event_id: '' })
    }
    setEventSaving(false)
  }

  if (loading) return <p>Učitavanje...</p>

  return (
    <div>
      <h3 style={{ fontSize: 16 }}>Članovi</h3>
      <AddMemberForm onAdded={load} />
      {members.length === 0 && <p>Nema još registrovanih članova.</p>}
      {members.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: 8 }}>Ime</th>
              <th style={{ padding: 8 }}>Kontakt</th>
              <th style={{ padding: 8 }}>Redovna grupa</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>
                  {m.full_name || '(bez imena)'}
                  {m.is_manual && <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>bez naloga</span>}
                </td>
                <td style={{ padding: 8, fontSize: 13 }}>
                  {m.phone || '—'}
                  {m.email && <div style={{ color: '#666' }}>{m.email}</div>}
                </td>
                <td style={{ padding: 8, fontSize: 13 }}>
                  {m.monthly.length === 0 && '—'}
                  {m.monthly.map(r => (
                    <div key={r.period}>
                      {monthLabel(r.period)}: {r.groups?.name} {r.status === 'paid' ? '✓' : '(čeka uplatu)'}
                    </div>
                  ))}
                </td>
                <td style={{ padding: 8 }}>
                  {m.is_manual && <button onClick={() => removeMember(m)} style={{ color: '#a33' }}>Ukloni</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 16 }}>Dodaj u redovnu grupu</h3>
      <form onSubmit={handleAddMonthly} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={monthlyForm.member_id} onChange={e => setMonthlyForm({ ...monthlyForm, member_id: e.target.value })} required>
          <option value="">— član —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={monthlyForm.group_id} onChange={e => setMonthlyForm({ ...monthlyForm, group_id: e.target.value })} required>
          <option value="">— grupa —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="month" value={monthlyForm.month} required
          onChange={e => setMonthlyForm({ ...monthlyForm, month: e.target.value })} />
        <button type="submit" disabled={monthlySaving}>Dodaj</button>
      </form>
      {monthlyMessage && <p style={{ fontSize: 13, margin: '0 0 24px' }}>{monthlyMessage}</p>}

      <h3 style={{ fontSize: 16, marginTop: 32 }}>Individualni časovi</h3>
      <form onSubmit={handleAddDropin} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={dropinForm.member_id} onChange={e => setDropinForm({ ...dropinForm, member_id: e.target.value })} required>
          <option value="">— član —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={dropinForm.group_id} onChange={e => handleDropinGroupChange(e.target.value)} required>
          <option value="">— grupa —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={dropinForm.session_date} onChange={e => setDropinForm({ ...dropinForm, session_date: e.target.value })}
          required disabled={dropinSessions.length === 0}>
          <option value="">— termin —</option>
          {dropinSessions.map(s => <option key={s.date} value={s.date}>{formatSessionLabel(s)}</option>)}
        </select>
        <button type="submit" disabled={dropinSaving}>Dodaj (i preko kapaciteta ako treba)</button>
      </form>
      {dropinError && <p style={{ color: 'crimson' }}>{dropinError}</p>}

      {dropinRows.length === 0 && <p style={{ fontSize: 13, color: '#666' }}>Nema još individualnih prijava.</p>}
      {dropinRows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: 8 }}>Član</th>
              <th style={{ padding: 8 }}>Grupa</th>
              <th style={{ padding: 8 }}>Datum</th>
              <th style={{ padding: 8 }}>Iznos</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {dropinRows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{r.profiles?.full_name || '—'}{r.added_by_admin && ' (dodala vlasnica)'}</td>
                <td style={{ padding: 8 }}>{r.groups?.name || '—'}</td>
                <td style={{ padding: 8 }}>{r.session_date}</td>
                <td style={{ padding: 8 }}>{r.amount} RSD</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => toggleDropinPaid(r)}>
                    {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                  </button>
                </td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => removeDropin(r)} style={{ color: '#a33' }}>Ukloni</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 16 }}>Dodaj na događaj / radionicu</h3>
      <form onSubmit={handleAddEventSignup} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={eventForm.member_id} onChange={e => setEventForm({ ...eventForm, member_id: e.target.value })} required>
          <option value="">— član —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={eventForm.event_id} onChange={e => setEventForm({ ...eventForm, event_id: e.target.value })} required>
          <option value="">— događaj —</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} · {formatEventDates(ev)}</option>)}
        </select>
        <button type="submit" disabled={eventSaving}>Dodaj</button>
      </form>
      {eventMessage && <p style={{ fontSize: 13, marginTop: 8 }}>{eventMessage}</p>}
    </div>
  )
}
