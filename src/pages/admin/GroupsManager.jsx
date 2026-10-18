import { errMsg } from '../../lib/errors'
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
  name: '', monthly_price: '', capacity: '',
  description_short: '', description_html: '', active: true
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
      capacity: group.capacity ?? '',
      description_short: group.description_short || '',
      description_html: group.description_html || '',
      active: group.active
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
      capacity: form.capacity === '' ? null : Number(form.capacity),
      description_short: form.description_short,
      description_html: form.description_html,
      active: form.active
    }
    if (selectedId) {
      const { error } = await supabase.from('groups').update(payload).eq('id', selectedId)
      if (error) alert('Greška: ' + errMsg(error))
    } else {
      const { data, error } = await supabase.from('groups').insert(payload).select().single()
      if (error) { alert('Greška: ' + errMsg(error)); setSaving(false); return }
      setSelectedId(data.id)
    }
    await loadGroups()
    setSaving(false)
  }

  async function deleteGroup() {
    const g = groups.find(x => x.id === selectedId)
    if (!g || g.active) return
    if (!confirm(`Trajno obrisati grupu „${g.name}"? Evidencija prijava ostaje u tabu „Termini i uplate".`)) return
    const { data, error } = await supabase.from('groups').delete().eq('id', selectedId).select()
    if (error) {
      alert('Greška: ' + errMsg(error))
    } else if (!data || data.length === 0) {
      alert('Grupa nije obrisana.')
    } else {
      selectGroup(null)
    }
    await loadGroups()
  }

  async function addScheduleRow() {
    if (!selectedId) { alert('Prvo sačuvaj grupu.'); return }
    const { error } = await supabase.from('group_schedule').insert({
      group_id: selectedId,
      weekday: Number(newDay.weekday),
      start_time: newDay.start_time
    })
    if (error) alert('Greška: ' + errMsg(error))
    const { data } = await supabase.from('group_schedule').select('*').eq('group_id', selectedId).order('weekday')
    setSchedule(data || [])
  }

  async function removeScheduleRow(id) {
    await supabase.from('group_schedule').delete().eq('id', id)
    setSchedule(schedule.filter(s => s.id !== id))
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  return (
    <div>
      <div className="row mb">
        <select value={selectedId || ''} onChange={e => selectGroup(e.target.value || null)}>
          <option value="">— Nova grupa —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name}{!g.active && ' (neaktivno)'}</option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSave}>
        <input className="field" placeholder="Naziv grupe" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} required />
        <div className="row nowrap">
          <input className="grow" type="number" placeholder="Mesečna cena (RSD)" value={form.monthly_price}
            onChange={e => setForm({ ...form, monthly_price: e.target.value })} required />
          <input className="grow" type="number" placeholder="Kapacitet (opciono)" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: e.target.value })} />
        </div>
        <input className="field" placeholder="Kratak opis (prikazuje se u listi)" value={form.description_short}
          onChange={e => setForm({ ...form, description_short: e.target.value })} />

        <label className="check">
          <input type="checkbox" checked={form.active}
            onChange={e => setForm({ ...form, active: e.target.checked })} /> Aktivno (vidljivo članovima)
        </label>

        <p className="small strong mt">Pun opis</p>
        <RichTextEditor
          value={form.description_html}
          onChange={html => setForm({ ...form, description_html: html })}
        />

        <button type="submit" className="mt" disabled={saving}>
          {selectedId ? 'Sačuvaj izmene' : 'Napravi grupu'}
        </button>
        {selectedId && groups.find(x => x.id === selectedId)?.active === false && (
          <button type="button" className="btn-danger mt" onClick={deleteGroup}>Obriši trajno</button>
        )}
      </form>

      {selectedId && (
        <div className="section">
          <h3>Termini</h3>
          <ul>
            {schedule.map(s => (
              <li key={s.id}>
                {WEEKDAYS.find(w => w.value === s.weekday)?.label} {s.start_time.slice(0, 5)}h
                {' '}<button type="button" className="btn-danger btn-sm" onClick={() => removeScheduleRow(s.id)}>Obriši</button>
              </li>
            ))}
          </ul>
          <div className="row">
            <select value={newDay.weekday} onChange={e => setNewDay({ ...newDay, weekday: e.target.value })}>
              {WEEKDAYS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
            <input className="grow" type="time" value={newDay.start_time}
              onChange={e => setNewDay({ ...newDay, start_time: e.target.value })} />
            <button type="button" onClick={addScheduleRow}>Dodaj termin</button>
          </div>
        </div>
      )}

      <p className="small muted mt">
        Spiskovi prijavljenih članova i statusi uplata za ovu grupu su u tabu „Termini i uplate".
      </p>
    </div>
  )
}
