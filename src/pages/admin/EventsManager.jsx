import { errMsg } from '../../lib/errors'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import RichTextEditor from '../../components/RichTextEditor'
import { formatEventDates, isPastEvent, todayLocal } from '../../lib/events'

const BLANK = {
  name: '', description_short: '', description_html: '',
  price: '', capacity: '', active: true,
  mode: 'single',
  date_single: '', date_from: '', date_to: '',
  has_time: true, start_time: '18:00', end_time: '19:00'
}

export default function EventsManager({ past = false, draft = null, onDraftUsed, onDuplicate }) {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(draft || BLANK)
  const [note, setNote] = useState(draft ? 'Kopija: postavi datum i uključi „Aktivno“ kad je događaj spreman.' : '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadEvents() }, [])
  useEffect(() => { if (draft && onDraftUsed) onDraftUsed() }, [draft, onDraftUsed])

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase.from('events').select('*').order('date_from', { ascending: false })
    setEvents(data || [])
    setLoading(false)
  }

  async function selectEvent(id) {
    setSelectedId(id)
    setError('')
    setNote('')
    if (!id) { setForm(BLANK); return }
    const ev = events.find(e => e.id === id)
    setForm({
      name: ev.name,
      description_short: ev.description_short || '',
      description_html: ev.description_html || '',
      price: ev.price,
      capacity: ev.capacity ?? '',
      active: ev.active,
      mode: ev.date_to ? 'multi' : 'single',
      date_single: ev.date_to ? '' : ev.date_from,
      date_from: ev.date_to ? ev.date_from : '',
      date_to: ev.date_to || '',
      has_time: !!(ev.start_time && ev.end_time),
      start_time: ev.start_time ? ev.start_time.slice(0, 5) : '18:00',
      end_time: ev.end_time ? ev.end_time.slice(0, 5) : '19:00'
    })
  }

  async function deleteEvent() {
    const ev = events.find(x => x.id === selectedId)
    if (!ev) return
    if (!confirm(`Trajno obrisati događaj „${ev.name}"? Evidencija prijava ostaje u tabu „Termini i uplate".`)) return
    const { data, error: err } = await supabase.from('events').delete().eq('id', selectedId).select()
    if (err) {
      setError('Greška: ' + errMsg(err))
    } else if (!data || data.length === 0) {
      setError('Događaj nije obrisan.')
    } else {
      setSelectedId(null)
      setForm(BLANK)
    }
    await loadEvents()
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    setNote('')
    if (form.mode === 'single' && !form.date_single) { setError('Unesi datum događaja.'); return }
    if (form.mode === 'multi' && (!form.date_from || !form.date_to)) { setError('Unesi oba datuma (od—do).'); return }
    setSaving(true)

    const payload = {
      name: form.name,
      description_short: form.description_short,
      description_html: form.description_html,
      price: Number(form.price),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      active: form.active,
      date_from: form.mode === 'single' ? form.date_single : form.date_from,
      date_to: form.mode === 'single' ? null : form.date_to,
      start_time: form.has_time ? form.start_time : null,
      end_time: form.has_time ? form.end_time : null
    }

    if (selectedId) {
      const { error: err } = await supabase.from('events').update(payload).eq('id', selectedId)
      if (err) setError(errMsg(err))
    } else {
      const { data, error: err } = await supabase
        .from('events')
        .insert({ ...payload, created_by: profile.id })
        .select()
        .single()
      if (err) { setError(errMsg(err)); setSaving(false); return }
      setSelectedId(data.id)
    }
    await loadEvents()
    setSaving(false)
  }

  const today = todayLocal()
  const shown = events
    .filter(ev => (past ? isPastEvent(ev, today) : !isPastEvent(ev, today)))
    .sort((a, b) => (past ? (a.date_from < b.date_from ? 1 : -1) : (a.date_from < b.date_from ? -1 : 1)))

  function duplicate() {
    const copy = { ...form, name: `DUPLIKAT – ${form.name}`, active: false, date_single: '', date_from: '', date_to: '' }
    if (past) { onDuplicate && onDuplicate(copy); return }
    setSelectedId(null)
    setForm(copy)
    setNote('Kopija: postavi datum i uključi „Aktivno“ kad je događaj spreman.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  return (
    <div>
      <div className="row mb">
        <select value={selectedId || ''} onChange={e => selectEvent(e.target.value || null)}>
          {!past && <option value="">— Novi događaj —</option>}
          {past && <option value="">— Izaberi događaj —</option>}
          {shown.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.name} · {formatEventDates(ev)}
              {!past && !ev.active && ' (neaktivno)'}
            </option>
          ))}
        </select>
      </div>

      {note && !selectedId && <p className="notice small">{note}</p>}
      {past && !selectedId && <p className="muted small">Izaberi prethodni događaj da ga vidiš, kopiraš ili obrišeš.</p>}
      {(!past || selectedId) && (
      <form onSubmit={handleSave}>
        <input className="field" placeholder="Naziv događaja" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} required />

        <input className="field" placeholder="Kratak opis (prikazuje se u listi)" value={form.description_short}
          onChange={e => setForm({ ...form, description_short: e.target.value })} required />

        <div className="row nowrap">
          <input className="grow" type="number" placeholder="Cena (RSD)" value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })} required />
          <input className="grow" type="number" placeholder="Kapacitet (opciono)" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: e.target.value })} />
        </div>

        <div className="row mb" style={{ gap: 20 }}>
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
          <input className="grow" type="date" value={form.date_single}
            onChange={e => setForm({ ...form, date_single: e.target.value })} required />
        ) : (
          <div className="row nowrap mb">
            <input className="grow" type="date" value={form.date_from}
              onChange={e => setForm({ ...form, date_from: e.target.value })} required />
            <input className="grow" type="date" value={form.date_to}
              onChange={e => setForm({ ...form, date_to: e.target.value })} required />
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={form.has_time}
            onChange={e => setForm({ ...form, has_time: e.target.checked })} /> Ima određenu satnicu
        </label>
        {form.has_time && (
          <div className="row nowrap mb">
            <input className="grow" type="time" value={form.start_time}
              onChange={e => setForm({ ...form, start_time: e.target.value })} />
            <input className="grow" type="time" value={form.end_time}
              onChange={e => setForm({ ...form, end_time: e.target.value })} />
          </div>
        )}

        {!past && (
          <label className="check">
            <input type="checkbox" checked={form.active}
              onChange={e => setForm({ ...form, active: e.target.checked })} /> Aktivno (vidljivo članovima)
          </label>
        )}

        <p className="small strong mt">Dug opis (opciono)</p>
        <RichTextEditor
          value={form.description_html}
          onChange={html => setForm({ ...form, description_html: html })}
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" className="mt" disabled={saving}>
          {selectedId ? 'Sačuvaj izmene' : 'Napravi događaj'}
        </button>
        {selectedId && (
          <button type="button" className="btn-ghost mt" onClick={duplicate}>Kopiraj događaj</button>
        )}
        {selectedId && (past || events.find(x => x.id === selectedId)?.active === false) && (
          <button type="button" className="btn-danger mt" onClick={deleteEvent}>Obriši trajno</button>
        )}
      </form>
      )}

      <p className="small muted mt">
        Spiskovi prijavljenih članova i statusi uplata za ovaj događaj su u tabu „Termini i uplate".
      </p>
    </div>
  )
}
