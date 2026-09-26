import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { makeDropinRefCode } from '../../lib/ips'

export default function Dropins() {
  const [rows, setRows] = useState([])
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ member_id: '', group_id: '', session_date: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: rowsData }, { data: groupsData }, { data: membersData }] = await Promise.all([
      supabase.from('dropin_signups')
        .select('id, session_date, amount, status, ref_code, added_by_admin, profiles(full_name), groups(name)')
        .order('session_date', { ascending: false }),
      supabase.from('groups').select('*').eq('active', true).order('name'),
      supabase.from('profiles').select('*').eq('is_admin', false).order('full_name')
    ])
    setRows(rowsData || [])
    setGroups(groupsData || [])
    setMembers(membersData || [])
    setLoading(false)
  }

  async function togglePaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase.from('dropin_signups').update({ status: newStatus }).eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await load()
  }

  async function handleAdd(e) {
    e.preventDefault()
    setFormError('')
    if (!form.member_id || !form.group_id || !form.session_date) return
    setSaving(true)
    const group = groups.find(g => g.id === form.group_id)
    const refCode = makeDropinRefCode(form.session_date, form.member_id, form.group_id)
    const { error } = await supabase.from('dropin_signups').insert({
      group_id: form.group_id,
      member_id: form.member_id,
      session_date: form.session_date,
      amount: group.dropin_price,
      ref_code: refCode,
      status: 'due',
      added_by_admin: true
    })
    if (error) setFormError(error.message)
    else setForm({ member_id: '', group_id: '', session_date: '' })
    await load()
    setSaving(false)
  }

  if (loading) return <p>Učitavanje...</p>

  return (
    <div>
      <h3 style={{ fontSize: 15 }}>Dodaj individualni čas ručno</h3>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} required>
          <option value="">— član —</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
        </select>
        <select value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })} required>
          <option value="">— grupa —</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="date" value={form.session_date} onChange={e => setForm({ ...form, session_date: e.target.value })} required />
        <button type="submit" disabled={saving}>Dodaj (i preko kapaciteta ako treba)</button>
      </form>
      {formError && <p style={{ color: 'crimson' }}>{formError}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: 8 }}>Član</th>
            <th style={{ padding: 8 }}>Grupa</th>
            <th style={{ padding: 8 }}>Datum</th>
            <th style={{ padding: 8 }}>Iznos</th>
            <th style={{ padding: 8 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{r.profiles?.full_name || '—'}{r.added_by_admin && ' (dodala vlasnica)'}</td>
              <td style={{ padding: 8 }}>{r.groups?.name || '—'}</td>
              <td style={{ padding: 8 }}>{r.session_date}</td>
              <td style={{ padding: 8 }}>{r.amount} RSD</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => togglePaid(r)}>
                  {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}