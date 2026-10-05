import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
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
  const { profile } = useAuth()
  const [inviteLink, setInviteLink] = useState('')
  const [inviteFor, setInviteFor] = useState('')
  const [copied, setCopied] = useState(false)
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
          .select('member_id, period, status, ref_code, groups(name)')
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

  async function createInvite(member) {
    const { data, error } = await supabase
      .from('invites')
      .insert({ created_by: profile.id, member_id: member ? member.id : null })
      .select('token')
      .single()
    if (error) { alert('Greška: ' + error.message); return }
    setInviteLink(`${window.location.origin}/register?token=${data.token}`)
    setInviteFor(member ? member.full_name : '')
    setCopied(false)
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
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
    const { error } = await supabase.from('dropin_signups').insert({
      group_id: dropinForm.group_id,
      member_id: dropinForm.member_id,
      session_date: dropinForm.session_date,
      amount: group.dropin_price,
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
    const { error } = await supabase.from('event_signups').insert({
      event_id: eventForm.event_id,
      member_id: eventForm.member_id,
      amount: ev.price,
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

  if (loading) return <p className="muted">Učitavanje...</p>

  return (
    <div>
      <h3>Članovi</h3>
      <AddMemberForm onAdded={load} />
      <div className="mb">
        <button className="btn-ghost" onClick={() => createInvite(null)}>Novi link za registraciju</button>
        {inviteLink && (
          <div className="card mt">
            <p className="small">
              Link{inviteFor ? ` za ${inviteFor}` : ''} važi 7 dana i može da se iskoristi jednom.
            </p>
            <input className="field" readOnly value={inviteLink} onFocus={e => e.target.select()} />
            <button onClick={copyInvite}>{copied ? '✓ Kopirano' : 'Kopiraj link'}</button>
          </div>
        )}
      </div>
      {members.length === 0 && <p className="muted">Nema još registrovanih članova.</p>}
      {members.length > 0 && (
        <div className="scroll-x"><table>
          <thead>
            <tr>
              <th>Ime</th>
              <th>Kontakt</th>
              <th>Redovna grupa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>
                  {m.full_name || '(bez imena)'}
                  {m.is_manual && <span className="badge" style={{ marginLeft: 6 }}>bez naloga</span>}
                </td>
                <td className="small">
                  {m.phone || '—'}
                  {m.email && <div className="muted">{m.email}</div>}
                </td>
                <td className="small">
                  {m.monthly.length === 0 && '—'}
                  {m.monthly.map(r => (
                    <div key={r.period}>
                      {monthLabel(r.period)}: {r.groups?.name} {r.status === 'paid' ? '✓' : '(čeka uplatu)'} <span className="muted">· poziv {r.ref_code}</span>
                    </div>
                  ))}
                </td>
                <td>
                  {m.is_manual && (
                    <>
                      <button className="btn-ghost btn-sm" onClick={() => createInvite(m)}>Link za registraciju</button>
                      <button className="btn-danger btn-sm" onClick={() => removeMember(m)}>Ukloni</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <h3>Dodaj u redovnu grupu</h3>
      <form onSubmit={handleAddMonthly} className="row mb">
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
      {monthlyMessage && <p className="small">{monthlyMessage}</p>}

      <h3 className="mt">Individualni časovi</h3>
      <form onSubmit={handleAddDropin} className="row mb">
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
      {dropinError && <p className="error">{dropinError}</p>}

      {dropinRows.length === 0 && <p className="small muted">Nema još individualnih prijava.</p>}
      {dropinRows.length > 0 && (
        <div className="scroll-x"><table>
          <thead>
            <tr>
              <th>Član</th>
              <th>Grupa</th>
              <th>Datum</th>
              <th>Iznos</th>
              <th>Poziv na broj</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dropinRows.map(r => (
              <tr key={r.id}>
                <td>{r.profiles?.full_name || '—'}{r.added_by_admin && ' (dodala vlasnica)'}</td>
                <td>{r.groups?.name || '—'}</td>
                <td>{r.session_date}</td>
                <td>{r.amount} RSD</td>
                <td className="strong">{r.ref_code}</td>
                <td>
                  <button className={r.status === 'paid' ? 'btn-sm' : 'btn-ghost btn-sm'} onClick={() => toggleDropinPaid(r)}>
                    {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                  </button>
                </td>
                <td>
                  <button className="btn-danger btn-sm" onClick={() => removeDropin(r)}>Ukloni</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <h3>Dodaj na događaj / radionicu</h3>
      <form onSubmit={handleAddEventSignup} className="row">
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
      {eventMessage && <p className="small">{eventMessage}</p>}
    </div>
  )
}
