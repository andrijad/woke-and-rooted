import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Izmena podataka člana (samo vlasnica). Email za prijavu se menja samo kod članova bez naloga.
export default function MemberEditForm({ member, onSaved, onCancel }) {
  const [form, setForm] = useState({
    full_name: member.full_name || '',
    phone: member.phone || '',
    nickname: member.nickname || '',
    email_secondary: member.email_secondary || '',
    email: member.email || ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.rpc('admin_update_member', {
      p_id: member.id,
      p_full_name: form.full_name,
      p_phone: form.phone,
      p_nickname: form.nickname,
      p_email_secondary: form.email_secondary,
      p_email: form.email
    })
    setSaving(false)
    if (err) setError('Greška: ' + err.message)
    else onSaved()
  }

  const set = k => e => setForm({ ...form, [k]: e.target.value })

  return (
    <form onSubmit={handleSubmit} className="card">
      <label className="lbl">Ime i prezime</label>
      <input className="field" required value={form.full_name} onChange={set('full_name')} />
      <label className="lbl">Nadimak (vidiš samo ti; ako je upisan, član ga vidi umesto imena)</label>
      <input className="field" value={form.nickname} onChange={set('nickname')} />
      <label className="lbl">Telefon</label>
      <input className="field" value={form.phone} onChange={set('phone')} />
      <label className="lbl">
        {member.is_manual ? 'Email' : 'Email za prijavu (ne može da se menja ovde)'}
      </label>
      <input className="field" type="email" value={form.email} onChange={set('email')} disabled={!member.is_manual} />
      <label className="lbl">Dodatni email (samo za kontakt)</label>
      <input className="field" type="email" value={form.email_secondary} onChange={set('email_secondary')} />
      <button type="submit" disabled={saving}>{saving ? 'Čuvam...' : 'Sačuvaj'}</button>
      <button type="button" className="btn-ghost" onClick={onCancel} style={{ marginLeft: 8 }}>Otkaži</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}
