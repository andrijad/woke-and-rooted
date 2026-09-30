import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { makeDropinRefCode, makeEventRefCode } from '../../lib/ips'
import { computeUpcomingSessions, formatSessionLabel } from '../../lib/schedule'
import { formatEventDates } from '../../lib/events'

export default function MembersManager() {
  const [members, setMembers] = useState([])
  const [groups, setGroups] = useState([])
  const [events, setEvents] = useState([])
  const [dropinRows, setDropinRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingGroupId, setSavingGroupId] = useState(null)

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
    const [{ data: groupsData }, { data: profilesData }, { data: membershipsData }, { data: eventsData }, { data: dropinData }] =
      await Promise.all([
        supabase.from('groups').select('*').eq('archived', false).order('name'),
        supabase.from('profiles').select('*').eq('is_admin', false).order('full_name'),
        supabase.from('group_memberships').select('*').eq('active', true),
        supabase.from('events').select('*').eq('archived', false).order('date_from', { ascending: false }),
        supabase.from('dropin_signups')
          .select('id, session_date, amount, status, ref_code, added_by_admin, profiles(full_name), groups(name)')
          .order('session_date', { ascending: false })
      ])
    setGroups(groupsData || [])
    setEvents(eventsData || [])
    setDropinRows(dropinData || [])
    const membershipByMember = Object.fromEntries((membershipsData || []).map(m => [m.member_id, m.group_id]))
    setMembers((profilesData || []).map(p => ({ ...p, group_id: membershipByMember[p.id] || '' })))
    setLoading(false)
  }

  async function assignGroup(memberId, groupId) {
    setSavingGroupId(memberId)
    const { error } = await supabase.rpc('admin_set_member_group', {
      p_member_id: memberId,
      p_group_id: groupId || null
    })
    if (error) alert('Greška: ' + error.message)
    await load()
    setSavingGroupId(null)
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
      {members.length === 0 && <p>Nema još registrovanih članova.</p>}
      {members.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: 8 }}>Ime</th>
              <th style={{ padding: 8 }}>Telefon</th>
              <th style={{ padding: 8 }}>Redovna grupa</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{m.full_name || '(bez imena)'}</td>
                <td style={{ padding: 8 }}>{m.phone || '—'}</td>
                <td style={{ padding: 8 }}>
                  <select value={m.group_id} disabled={savingGroupId === m.id}
                    onChange={e => assignGroup(m.id, e.target.value)}>
                    <option value="">— nije raspoređena —</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 16 }}>Individualni časovi</h3>
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