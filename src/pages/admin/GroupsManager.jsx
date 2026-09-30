import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import RichTextEditor from '../../components/RichTextEditor'

const WEEKDAYS = [
  { value: 1, label: 'Ponedeljak' },
  { value: 2, label: 'Utorak' },
  { value: 3, label: 'Sreda' },
  { value: 4, label: 'Četvrtak' },
  { value: 5, label: 'Petak' },
  { value: 6, label: 'Subota' },
  { value: 7, label: 'Nedelja' },
]

const BLANK = {
  name: '', monthly_price: '', dropin_price: '', capacity: '',
  description_short: '', description_html: '', archived: false
}

export default function GroupsManager() {
  const [groups, setGroups] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [schedule, setSchedule] = useState([])
  const [newDay, setNewDay] = useState({ weekday: '1', start_time: '18:00' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    setLoading(true)
    const { data } = await supabase.from('groups').select('*').order('name')
    setGroups(data || [])
    setLoading(false)
  }

  async function selectGroup(id) {
    setSelectedId(id)
    if (!id) { setForm(BLANK); setSchedule([]); return }
    const group = groups.find(g => g.id === id)
    setForm({
      name: group.name,
      monthly_price: group.monthly_price,
      dropin_price: group.dropin_price,
      capacity: group.capacity ?? '',
      description_short: group.description_short || '',
      description_html: group.description_html || '',
      archived: group.archived
    })
    const { data } = await supabase.from('group_schedule').select('*').eq('group_id', id).order('weekday')
    setSchedule(data || [])
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      name: form.name,
      monthly_price: Number(form.monthly_price),
      dropin_price: Number(form.dropin_price),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      description_short: form.description_short,
      description_html: form.description_html,
      archived: form.archived
    }
    if (selectedId) {
      const { error } = await supabase.from('groups').update(payload).eq('id', selectedId)
      if (error) alert('Greška: ' + error.message)
    } else {
      const { data, error } = await supabase.from('groups').insert({ ...payload, active: true }).select().single()
      if (error) { alert('Greška: ' + error.message); setSaving(false); return }
      setSelectedId(data.id)
    }
    await loadGroups()
    setSaving(false)
  }

  async function addScheduleRow() {
    if (!selectedId) { alert('Prvo sačuvaj grupu.'); return }
    const { error } = await supabase.from('group_schedule').insert({
      group_id: selectedId,
      weekday: Number(newDay.weekday),
      start_time: newDay.start_time
    })
    if (error) alert('Greška: ' + error.message)
    const { data } = await supabase.from('group_schedule').select('*').eq('group_id', selectedId).order('weekday')
    setSchedule(data || [])
  }

  async function removeScheduleRow(id) {
    await supabase.from('group_schedule').delete().eq('id', id)
    setSchedule(schedule.filter(s => s.id !== id))
  }

  if (loading) return <p>Učitavanje...</p>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selectedId || ''} onChange={e => selectGroup(e.target.value || null)}>
          <option value="">— Nova grupa —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}{g.archived && ' (arhivirano)'}</option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSave}>
        <input placeholder="Naziv grupe" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} required
          style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Mesečna cena (RSD)" value={form.monthly_price}
            onChange={e => setForm({ ...form, monthly_price: e.target.value })} required
            style={{ flex: 1, padding: 8 }} />
          <input type="number" placeholder="Cena individualnog (RSD)" value={form.dropin_price}
            onChange={e => setForm({ ...form, dropin_price: e.target.value })} required
            style={{ flex: 1, padding: 8 }} />
          <input type="number" placeholder="Kapacitet (opciono)" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: e.target.value })}
            style={{ flex: 1, padding: 8 }} />
        </div>
        <input placeholder="Kratak opis (prikazuje se u listi)" value={form.description_short}
          onChange={e => setForm({ ...form, description_short: e.target.value })}
          style={{ display: 'block', width: '100%', margin: '6px 0', padding: 8 }} />

        <label style={{ display: 'block', margin: '10px 0', fontSize: 14 }}>
          <input type="checkbox" checked={form.archived}
            onChange={e => setForm({ ...form, archived: e.target.checked })} /> Arhivirano (sakriveno od članova, ti i dalje vidiš)
        </label>

        <p style={{ fontSize: 13, fontWeight: 700, marginTop: 12 }}>Pun opis</p>
        <RichTextEditor
          value={form.description_html}
          onChange={html => setForm({ ...form, description_html: html })}
        />

        <button type="submit" disabled={saving} style={{ marginTop: 12 }}>
          {selectedId ? 'Sačuvaj izmene' : 'Napravi grupu'}
        </button>
      </form>

      {selectedId && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 15 }}>Termini</h3>
          <ul>
            {schedule.map(s => (
              <li key={s.id}>
                {WEEKDAYS.find(w => w.value === s.weekday)?.label} {s.start_time.slice(0, 5)}h
                {' '}<button type="button" onClick={() => removeScheduleRow(s.id)}>Obriši</button>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={newDay.weekday} onChange={e => setNewDay({ ...newDay, weekday: e.target.value })}>
              {WEEKDAYS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
            <input type="time" value={newDay.start_time}
              onChange={e => setNewDay({ ...newDay, start_time: e.target.value })} />
            <button type="button" onClick={addScheduleRow}>Dodaj termin</button>
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, color: '#666', marginTop: 20 }}>
        Spiskovi prijavljenih članova i statusi uplata za ovu grupu su u tabu „Termini i uplate".
      </p>
    </div>
  )
}