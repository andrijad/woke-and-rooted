import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import RichTextEditor from '../../components/RichTextEditor'
import { formatEventDates } from '../../lib/events'

const BLANK = {
  name: '', description_short: '', description_html: '',
  price: '', capacity: '', published: true, archived: false,
  mode: 'single',
  date_single: '', date_from: '', date_to: '',
  has_time: true, start_time: '18:00', end_time: '19:00'
}

export default function EventsManager() {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadEvents() }, [])

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase.from('events').select('*').order('date_from', { ascending: false })
    setEvents(data || [])
    setLoading(false)
  }

  async function selectEvent(id) {
    setSelectedId(id)
    setError('')
    if (!id) { setForm(BLANK); return }
    const ev = events.find(e => e.id === id)
    setForm({
      name: ev.name,
      description_short: ev.description_short || '',
      description_html: ev.description_html || '',
      price: ev.price,
      capacity: ev.capacity ?? '',
      published: ev.published,
      archived: ev.archived,
      mode: ev.date_to ? 'multi' : 'single',
      date_single: ev.date_to ? '' : ev.date_from,
      date_from: ev.date_to ? ev.date_from : '',
      date_to: ev.date_to || '',
      has_time: !!(ev.start_time && ev.end_time),
      start_time: ev.start_time ? ev.start_time.slice(0, 5) : '18:00',
      end_time: ev.end_time ? ev.end_time.slice(0, 5) : '19:00'
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    if (form.mode === 'single' && !form.date_single) { setError('Unesi datum događaja.'); return }
    if (form.mode === 'multi' && (!form.date_from || !form.date_to)) { setError('Unesi oba datuma (od—do).'); return }
    setSaving(true)

    const payload = {
      name: form.name,
      description_short: form.description_short,
      description_html: form.description_html,
      price: Number(form.price),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      published: form.published,
      archived: form.archived,
      date_from: form.mode === 'single' ? form.date_single : form.date_from,
      date_to: form.mode === 'single' ? null : form.date_to,
      start_time: form.has_time ? form.start_time : null,
      end_time: form.has_time ? form.end_time : null
    }

    if (selectedId) {
      const { error: err } = await supabase.from('events').update(payload).eq('id', selectedId)
      if (err) setError(err.message)
    } else {
      const { data, error: err } = await supabase
        .from('events')
        .insert({ ...payload, created_by: profile.id })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      setSelectedId(data.id)
    }
    await loadEvents()
    setSaving(false)
  }

  if (loading) return <p>Učitavanje...</p>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selectedId || ''} onChange={e => selectEvent(e.target.value || null)}>
          <option value="">— Novi događaj —</option>
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name} · {formatEventDates(ev)}
              {!ev.published && ' (nacrt)'}
              {ev.archived && ' (arhivirano)'}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSave}>
        <input placeholder="Naziv događaja" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} required
          style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />

        <input placeholder="Kratak opis (prikazuje se u listi)" value={form.description_short}
          onChange={e => setForm({ ...form, description_short: e.target.value })} required
          style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Cena (RSD)" value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })} required
            style={{ flex: 1, padding: 8 }} />
          <input type="number" placeholder="Kapacitet (opciono)" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: e.target.value })}
            style={{ flex: 1, padding: 8 }} />
        </div>

        <div style={{ display: 'flex', gap: 16, margin: '10px 0', fontSize: 14 }}>
          <label>
            <input type="radio" checked={form.mode === 'single'}
              onChange={() => setForm({ ...form, mode: 'single' })} /> Jednodnevni
          </label>
          <label>
            <input type="radio" checked={form.mode === 'multi'}
              onChange={() => setForm({ ...form, mode: 'multi' })} /> Višednevni
          </label>
        </div>

        {form.mode === 'single' ? (
          <input type="date" value={form.date_single}
            onChange={e => setForm({ ...form, date_single: e.target.value })} required
            style={{ display: 'block', padding: 8, marginBottom: 8 }} />
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" value={form.date_from}
              onChange={e => setForm({ ...form, date_from: e.target.value })} required
              style={{ flex: 1, padding: 8 }} />
            <input type="date" value={form.date_to}
              onChange={e => setForm({ ...form, date_to: e.target.value })} required
              style={{ flex: 1, padding: 8 }} />
          </div>
        )}

        <label style={{ display: 'block', fontSize: 14, marginBottom: 4 }}>
          <input type="checkbox" checked={form.has_time}
            onChange={e => setForm({ ...form, has_time: e.target.checked })} /> Ima određenu satnicu
        </label>
        {form.has_time && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="time" value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })}
              style={{ flex: 1, padding: 8 }} />
            <input type="time" value={form.end_time}
              onChange={e => setForm({ ...form, end_time: e.target.value })}
              style={{ flex: 1, padding: 8 }} />
          </div>
        )}

        <label style={{ display: 'block', margin: '10px 0', fontSize: 14 }}>
          <input type="checkbox" checked={form.published}
            onChange={e => setForm({ ...form, published: e.target.checked })} /> Objavljeno (vidljivo članovima)
        </label>

        <label style={{ display: 'block', margin: '10px 0', fontSize: 14 }}>
          <input type="checkbox" checked={form.archived}
            onChange={e => setForm({ ...form, archived: e.target.checked })} /> Arhivirano (sakriveno od članova, ti i dalje vidiš)
        </label>

        <p style={{ fontSize: 13, fontWeight: 700, marginTop: 12 }}>Dug opis (opciono)</p>
        <RichTextEditor
          value={form.description_html}
          onChange={html => setForm({ ...form, description_html: html })}
        />

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <button type="submit" disabled={saving} style={{ marginTop: 12 }}>
          {selectedId ? 'Sačuvaj izmene' : 'Napravi događaj'}
        </button>
      </form>

      <p style={{ fontSize: 13, color: '#666', marginTop: 20 }}>
        Spiskovi prijavljenih članova i statusi uplata za ovaj događaj su u tabu „Termini i uplate".
      </p>
    </div>
  )
}
