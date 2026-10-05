import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Evidencija: pravi se samo profil, bez naloga za prijavu.
// Email i telefon služe vlasnici da kasnije pošalje link za registraciju.
export default function AddMemberForm({ onAdded }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('profiles').insert({
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase() || null,
      phone: form.phone.trim() || null,
      is_manual: true
    })
    if (err) setError('Greška: ' + err.message)
    else {
      setForm({ full_name: '', email: '', phone: '' })
      setOpen(false)
      onAdded && onAdded()
    }
    setSaving(false)
  }

  if (!open) return <div style={{ marginBottom: 16 }}><button onClick={() => setOpen(true)}>+ Dodaj člana</button></div>

  return (
    <form onSubmit={handleSubmit} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#555' }}>
        Član se vodi u evidenciji i nema nalog za prijavu. Email i telefon su za tvoju upotrebu.
      </p>
      <input placeholder="Ime i prezime" required value={form.full_name}
        onChange={e => setForm({ ...form, full_name: e.target.value })}
        style={{ display: 'block', width: '100%', margin: '0 0 8px', padding: 8, boxSizing: 'border-box' }} />
      <input type="email" placeholder="Email (opciono)" value={form.email}
        onChange={e => setForm({ ...form, email: e.target.value })}
        style={{ display: 'block', width: '100%', margin: '0 0 8px', padding: 8, boxSizing: 'border-box' }} />
      <input placeholder="Telefon (opciono)" value={form.phone}
        onChange={e => setForm({ ...form, phone: e.target.value })}
        style={{ display: 'block', width: '100%', margin: '0 0 8px', padding: 8, boxSizing: 'border-box' }} />
      <button type="submit" disabled={saving}>{saving ? 'Čuvam...' : 'Sačuvaj'}</button>
      <button type="button" onClick={() => setOpen(false)} style={{ marginLeft: 8 }}>Otkaži</button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </form>
  )
}
