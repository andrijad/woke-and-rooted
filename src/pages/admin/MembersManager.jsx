import { errMsg } from '../../lib/errors'
import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
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
    const [members, setMembers] = useState([])
  const [groups, setGroups] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [addFor, setAddFor] = useState(null) // { id, kind: 'group' | 'event' }
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

  async function deleteMember(m) {
    if (!confirm(`Trajno obrisati ${m.full_name}? Ovo se ne može poništiti.`)) return
    let { error } = await supabase.rpc('admin_delete_account', { p_id: m.id, p_with_signups: false })
    if (error && /ima prijave/i.test(error.message)) {
      const n = error.message.match(/\((\d+)\)/)?.[1] || ''
      if (!confirm(`${m.full_name} ima prijave${n ? ` (${n})` : ''}. Obrisati i njih? Ovo se ne može poništiti.`)) return
      ;({ error } = await supabase.rpc('admin_delete_account', { p_id: m.id, p_with_signups: true }))
    }
    if (error) alert('Greška: ' + errMsg(error))
    await load()
  }

  function openAdd(m, kind) {
    setMonthlyMessage('')
    setEventMessage('')
    setMonthlyForm(f => ({ ...f, member_id: m.id, group_id: '' }))
    setEventForm({ member_id: m.id, event_id: '' })
    setAddFor({ id: m.id, kind })
  }

  async function rpcAction(name, args, okConfirm) {
    if (okConfirm && !confirm(okConfirm)) return
    const { error } = await supabase.rpc(name, args)
    if (error) alert('Greška: ' + errMsg(error))
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
        : 'Greška: ' + errMsg(error))
    } else {
      setMonthlyMessage('Dodato. Uplatu potvrđuješ u tabu „Termini i uplate".')
      setMonthlyForm({ ...monthlyForm, group_id: '' })
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
        : 'Greška: ' + errMsg(error))
    } else {
      setEventMessage('Dodato. Status uplate je u tabu „Termini i uplate".')
      setEventForm({ ...eventForm, event_id: '' })
    }
    setEventSaving(false)
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  return (
    <div>
      <h3>Članovi</h3>
      <AddMemberForm onAdded={load} />
      {members.some(m => m.archived) && (
        <label className="check mb">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Prikaži arhivirane
        </label>
      )}
      {members.length === 0 && <p className="muted">Nema još registrovanih članova.</p>}
      {members.length > 0 && (
        <div className="scroll-x"><table className="members">
          <thead>
            <tr>
              <th>Ime</th>
              <th>Kontakt</th>
              <th>Redovna grupa</th>
            </tr>
          </thead>
          <tbody>
            {members.filter(m => showArchived || !m.archived).map(m => editingId === m.id ? (
              <tr key={m.id}>
                <td colSpan={3}>
                  <div className="m-sticky">
                    <MemberEditForm member={m} onCancel={() => setEditingId(null)}
                      onSaved={async () => { setEditingId(null); await load() }} />
                  </div>
                </td>
              </tr>
            ) : (
              <Fragment key={m.id}>
              <tr>
                <td className="m-name">
                  <strong>{ownerName(m, '(bez imena)')}</strong>
                  {m.is_manual && <span className="badge" style={{ marginLeft: 6 }}>bez naloga</span>}
                  {m.archived && <span className="badge" style={{ marginLeft: 6 }}>arhiviran</span>}
                  {m.is_new && <span className="badge badge-new" style={{ marginLeft: 6 }}>nov član</span>}
                  <div className="row-actions">
                    <button type="button" onClick={() => setEditingId(m.id)}>Izmeni</button>
                    {!m.archived && (
                      <button type="button" onClick={() => openAdd(m, 'group')}>Rasporedi</button>
                    )}
                    {m.archived ? (
                      <>
                        <button type="button" onClick={() => rpcAction('admin_set_member_archived', { p_id: m.id, p_archived: false })}>Vrati</button>
                        <button type="button" className="danger" onClick={() => deleteMember(m)}>Obriši trajno</button>
                      </>
                    ) : (
                      <button type="button" className="danger"
                        onClick={() => rpcAction('admin_set_member_archived', { p_id: m.id, p_archived: true })}>Arhiviraj</button>
                    )}
                  </div>
                  {m.merge_candidate_id && (() => {
                    const cand = members.find(x => x.id === m.merge_candidate_id)
                    return cand ? (
                      <div className="notice small">
                        Isti email već postoji u evidenciji: <strong>{cand.full_name}</strong>.
                        <div>
                          <button className="btn-sm" onClick={() => rpcAction('admin_merge_member', { p_new: m.id },
                            `Spojiti nalog sa evidencijom „${cand.full_name}"? Sve prijave se prebacuju na novi nalog.`)}>Spoji</button>
                          <button className="btn-ghost btn-sm" onClick={() => rpcAction('admin_dismiss_merge', { p_new: m.id })}>To je druga osoba</button>
                        </div>
                      </div>
                    ) : null
                  })()}
                </td>
                <td className="small m-contact">
                  {m.phone || '—'}
                  {m.email && (m.is_manual
                    ? <div className="muted">{m.email}</div>
                    : m.email_verified
                      ? <div className="muted">{m.email} <span className="verified" title="Email je potvrđen">✓</span></div>
                      : <div className="unverified" title="Član još nije potvrdio email">
                          {m.email} · nije potvrđen
                          <div className="row-actions">
                            <button type="button" onClick={() => rpcAction('admin_confirm_email', { p_id: m.id },
                              `Ručno potvrditi email ${m.email}? Uradi to samo ako si sigurna da adresa pripada ovom članu.`)}>Potvrdi ručno</button>
                          </div>
                        </div>)}
                  {m.email_secondary && <div className="muted">{m.email_secondary}</div>}
                </td>
                <td className="small m-groups">
                  {m.monthly.length === 0 && '—'}
                  {m.monthly.map(r => (
                    <div key={r.period}>
                      {monthLabel(r.period)}: {r.groups?.name} {r.status === 'paid' ? '✓' : '(čeka uplatu)'}
                    </div>
                  ))}
                </td>
              </tr>
              {addFor?.id === m.id && (
                <tr>
                  <td colSpan={3}>
                    <div className="m-sticky">
                    <div className="row mb">
                      <select value={addFor.kind} onChange={e => setAddFor({ ...addFor, kind: e.target.value })}
                        aria-label="Dodaj u">
                        <option value="group">Joga grupa</option>
                        <option value="event">Događaj / radionica</option>
                      </select>
                    </div>
                    {addFor.kind === 'group' ? (
                      <form onSubmit={handleAddMonthly} className="row">
                        <select value={monthlyForm.group_id} required
                          onChange={e => setMonthlyForm({ ...monthlyForm, group_id: e.target.value })}>
                          <option value="">— grupa —</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        <input type="month" value={monthlyForm.month} required
                          onChange={e => setMonthlyForm({ ...monthlyForm, month: e.target.value })} />
                        <button type="submit" disabled={monthlySaving}>Dodaj u grupu</button>
                        <button type="button" className="btn-ghost" onClick={() => setAddFor(null)}>Zatvori</button>
                      </form>
                    ) : (
                      <form onSubmit={handleAddEventSignup} className="row">
                        <select value={eventForm.event_id} required
                          onChange={e => setEventForm({ ...eventForm, event_id: e.target.value })}>
                          <option value="">— događaj —</option>
                          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.name} · {formatEventDates(ev)}</option>)}
                        </select>
                        <button type="submit" disabled={eventSaving}>Dodaj na događaj</button>
                        <button type="button" className="btn-ghost" onClick={() => setAddFor(null)}>Zatvori</button>
                      </form>
                    )}
                    {addFor.kind === 'group' && monthlyMessage && <p className="small">{monthlyMessage}</p>}
                    {addFor.kind === 'event' && eventMessage && <p className="small">{eventMessage}</p>}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
