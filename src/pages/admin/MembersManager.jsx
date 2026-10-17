import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatEventDates } from '../../lib/events'
import AddMemberForm from './AddMemberForm'
import MemberEditForm from './MemberEditForm'
import { ownerName } from '../../lib/names'

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
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [monthlyForm, setMonthlyForm] = useState({ member_id: '', group_id: '', month: monthStart().slice(0, 7) })
  const [monthlySaving, setMonthlySaving] = useState(false)
  const [monthlyMessage, setMonthlyMessage] = useState('')

  const [eventForm, setEventForm] = useState({ member_id: '', event_id: '' })
  const [eventSaving, setEventSaving] = useState(false)
  const [eventMessage, setEventMessage] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: groupsData }, { data: profilesData }, { data: monthlyData }, { data: eventsData }] =
      await Promise.all([
        supabase.from('groups').select('*').eq('archived', false).order('name'),
        supabase.from('profiles').select('*').eq('is_admin', false).order('full_name'),
        supabase.from('monthly_signups')
          .select('member_id, period, status, ref_code, groups(name)')
          .gte('period', monthStart())
          .order('period'),
        supabase.from('events').select('*').eq('archived', false).order('date_from', { ascending: false })
      ])
    setGroups(groupsData || [])
    setEvents(eventsData || [])
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
            {members.map(m => editingId === m.id ? (
              <tr key={m.id}>
                <td colSpan={4}>
                  <MemberEditForm member={m} onCancel={() => setEditingId(null)}
                    onSaved={async () => { setEditingId(null); await load() }} />
                </td>
              </tr>
            ) : (
              <tr key={m.id}>
                <td>
                  {ownerName(m, '(bez imena)')}
                  {m.is_manual && <span className="badge" style={{ marginLeft: 6 }}>bez naloga</span>}
                </td>
                <td className="small">
                  {m.phone || '—'}
                  {m.email && <div className="muted">{m.email}</div>}
                  {m.email_secondary && <div className="muted">{m.email_secondary}</div>}
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
                  <button className="btn-ghost btn-sm" onClick={() => setEditingId(m.id)}>Izmeni</button>
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
          {members.map(m => <option key={m.id} value={m.id}>{ownerName(m)}</option>)}
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

      <h3>Dodaj na događaj / radionicu</h3>
      <form onSubmit={handleAddEventSignup} className="row">
        <select value={eventForm.member_id} onChange={e => setEventForm({ ...eventForm, member_id: e.target.value })} required>
          <option value="">— član —</option>
          {members.map(m => <option key={m.id} value={m.id}>{ownerName(m)}</option>)}
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
