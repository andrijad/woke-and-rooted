import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function MembersList() {
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: groupsData }, { data: profilesData }, { data: membershipsData }] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('profiles').select('*').eq('is_admin', false).order('full_name'),
      supabase.from('group_memberships').select('*').eq('active', true)
    ])
    setGroups(groupsData || [])
    const membershipByMember = Object.fromEntries((membershipsData || []).map(m => [m.member_id, m.group_id]))
    setMembers((profilesData || []).map(p => ({ ...p, group_id: membershipByMember[p.id] || '' })))
    setLoading(false)
  }

  async function assignGroup(memberId, groupId) {
    setSavingId(memberId)
    const { error } = await supabase.rpc('admin_set_member_group', {
      p_member_id: memberId,
      p_group_id: groupId || null
    })
    if (error) alert('Greška: ' + error.message)
    await load()
    setSavingId(null)
  }

  if (loading) return <p>Učitavanje...</p>
  if (members.length === 0) return <p>Nema još registrovanih članova.</p>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
              <select
                value={m.group_id}
                disabled={savingId === m.id}
                onChange={e => assignGroup(m.id, e.target.value)}
              >
                <option value="">— nije raspoređena —</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}