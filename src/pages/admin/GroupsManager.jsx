import { errMsg } from '../../lib/errors'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import RichTextEditor from '../../components/RichTextEditor'
import { WEEKDAY_NAMES } from '../../lib/schedule'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7].map(v => ({ value: v, label: WEEKDAY_NAMES[v] }))

const BLANK = { name: '', monthly_price: '', capacity: '', active: true }

function scheduleText(rows) {
  return (rows || [])
    .slice()
    .sort((a, b) => a.weekday - b.weekday || (a.start_time < b.start_time ? -1 : 1))
    .map(s => `${WEEKDAY_NAMES[s.weekday]} ${s.start_time.slice(0, 5)}h`)
    .join(', ')
}

// Zajednički naziv i opis joge (vide ga članovi iznad liste grupa).
function YogaInfo() {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('studio_settings')
        .select('yoga_title, yoga_description_short, yoga_description_html').eq('id', 1).single()
      if (cancelled) return
      setForm({
        yoga_title: data?.yoga_title || 'Redovna joga',
        yoga_description_short: data?.yoga_description_short || '',
        yoga_description_html: data?.yoga_description_html || ''
      })
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function save(e) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const { data, error } = await supabase.from('studio_settings').update(form).eq('id', 1).select()
    setSaving(false)
    if (error) setMsg('Greška: ' + errMsg(error))
    else if (!data || data.length === 0) setMsg('Nije sačuvano.')
    else setMsg('Sačuvano.')
  }

  if (!form) return null

  return (
    <form className="card" onSubmit={save}>
      <h3>Joga</h3>
      <p className="small muted">Naziv i opis koje članovi vide iznad liste grupa.</p>
      <input className="field" placeholder="Naziv (npr. Redovna joga)" value={form.yoga_title}
        onChange={e => setForm({ ...form, yoga_title: e.target.value })} required />
      <input className="field" placeholder="Kratak opis" value={form.yoga_description_short}
        onChange={e => setForm({ ...form, yoga_description_short: e.target.value })} />
      <p className="small strong mt">Pun opis (opciono)</p>
      <RichTextEditor value={form.yoga_description_html}
        onChange={html => setForm({ ...form, yoga_description_html: html })} />
      <div className="row mt">
        <button type="submit" disabled={saving}>Sačuvaj opis</button>
        {msg && <span className="small muted">{msg}</span>}
      </div>
    </form>
  )
}

export default function GroupsManager() {
  const [groups, setGroups] = useState([])
  const [scheduleByGroup, setScheduleByGroup] = useState({})
  const [editing, setEditing] = useState(null) // null | 'new' | group id
  const [form, setForm] = useState(BLANK)
  const [schedule, setSchedule] = useState([]) // termini grupe koja se uređuje (za novu: još nesačuvani)
  const [newDay, setNewDay] = useState({ weekday: '1', start_time: '18:00' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    const [{ data }, { data: rows }] = await Promise.all([
      supabase.from('groups').select('*').order('name'),
      supabase.from('group_schedule').select('*')
    ])
    const map = {}
    for (const s of rows || []) (map[s.group_id] ||= []).push(s)
    setGroups(data || [])
    setScheduleByGroup(map)
    setLoading(false)
    return map
  }

  function startNew() {
    setEditing('new'); setForm(BLANK); setSchedule([]); setError('')
  }

  function startEdit(g) {
    setEditing(g.id)
    setForm({ name: g.name, monthly_price: g.monthly_price, capacity: g.capacity ?? '', active: g.active })
    setSchedule(scheduleByGroup[g.id] || [])
    setError('')
  }

  function close() {
    setEditing(null); setForm(BLANK); setSchedule([]); setError('')
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      name: form.name,
      monthly_price: Number(form.monthly_price),
      capacity: form.capacity === '' ? null : Number(form.capacity),
      active: form.active
    }
    if (editing === 'new') {
      const { data, error: err } = await supabase.from('groups').insert(payload).select().single()
      if (err) { setError(errMsg(err)); setSaving(false); return }
      if (schedule.length > 0) {
        const { error: sErr } = await supabase.from('group_schedule').insert(
          schedule.map(s => ({ group_id: data.id, weekday: s.weekday, start_time: s.start_time }))
        )
        if (sErr) setError('Grupa je napravljena, ali termini nisu sačuvani: ' + errMsg(sErr))
      }
    } else {
      const { error: err } = await supabase.from('groups').update(payload).eq('id', editing)
      if (err) { setError(errMsg(err)); setSaving(false); return }
    }
    await loadGroups()
    setSaving(false)
    close()
  }

  async function addScheduleRow() {
    const row = { weekday: Number(newDay.weekday), start_time: newDay.start_time }
    if (editing === 'new') {
      setSchedule([...schedule, { ...row, id: `tmp-${Date.now()}` }])
      return
    }
    const { error: err } = await supabase.from('group_schedule').insert({ ...row, group_id: editing })
    if (err) { setError(errMsg(err)); return }
    const map = await loadGroups()
    setSchedule(map[editing] || [])
  }

  async function removeScheduleRow(s) {
    if (editing === 'new') { setSchedule(schedule.filter(x => x.id !== s.id)); return }
    await supabase.from('group_schedule').delete().eq('id', s.id).select()
    const map = await loadGroups()
    setSchedule(map[editing] || [])
  }

  async function deleteGroup(g) {
    if (g.active) return
    if (!confirm(`Trajno obrisati grupu „${g.name}"? Evidencija prijava ostaje u tabu „Termini i uplate".`)) return
    const { data, error: err } = await supabase.from('groups').delete().eq('id', g.id).select()
    if (err) alert('Greška: ' + errMsg(err))
    else if (!data || data.length === 0) alert('Grupa nije obrisana.')
    if (editing === g.id) close()
    await loadGroups()
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  const editForm = (
    <form className="card group-edit" onSubmit={handleSave}>
      <h4>{editing === 'new' ? 'Nova grupa' : 'Izmena grupe'}</h4>
      <label className="lbl">Naziv grupe
        <input className="field" placeholder="npr. Jutarnja" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} required />
      </label>
      <div className="row nowrap">
        <label className="lbl grow">Mesečna cena (RSD)
          <input className="field" type="number" value={form.monthly_price}
            onChange={e => setForm({ ...form, monthly_price: e.target.value })} required />
        </label>
        <label className="lbl grow">Kapacitet
          <input className="field" type="number" placeholder="bez ograničenja" value={form.capacity}
            onChange={e => setForm({ ...form, capacity: e.target.value })} />
        </label>
      </div>

      <p className="small strong mt">Termini</p>
      {schedule.length === 0 && <p className="small muted">Još nema termina.</p>}
      <ul className="schedule-list">
        {schedule.slice().sort((a, b) => a.weekday - b.weekday || (a.start_time < b.start_time ? -1 : 1)).map(s => (
          <li key={s.id}>
            <span>{WEEKDAY_NAMES[s.weekday]} {s.start_time.slice(0, 5)}h</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => removeScheduleRow(s)}>Ukloni</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <select value={newDay.weekday} onChange={e => setNewDay({ ...newDay, weekday: e.target.value })}>
          {WEEKDAYS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
        </select>
        <input type="time" value={newDay.start_time}
          onChange={e => setNewDay({ ...newDay, start_time: e.target.value })} />
        <button type="button" className="btn-ghost" onClick={addScheduleRow}>Dodaj termin</button>
      </div>

      <label className="check mt">
        <input type="checkbox" checked={form.active}
          onChange={e => setForm({ ...form, active: e.target.checked })} /> Aktivno (vidljivo članovima)
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row mt">
        <button type="submit" disabled={saving}>{editing === 'new' ? 'Napravi grupu' : 'Sačuvaj izmene'}</button>
        <button type="button" className="btn-ghost" onClick={close}>Odustani</button>
      </div>
    </form>
  )

  return (
    <div>
      <YogaInfo />

      <div className="row between mt mb">
        <h3 className="no-margin">Grupe</h3>
        {editing !== 'new' && <button onClick={startNew}>+ Nova grupa</button>}
      </div>
      {editing === 'new' && editForm}

      {groups.length === 0 && editing !== 'new' && <p className="small muted">Još nema grupa.</p>}

      {groups.map(g => (
        editing === g.id ? <div key={g.id}>{editForm}</div> : (
          <div key={g.id} className={`group-row${g.active ? '' : ' is-inactive'}`}>
            <div className="group-row-main">
              <p className="strong no-margin">
                {g.name}
                {!g.active && <span className="badge" style={{ marginLeft: 8 }}>neaktivno</span>}
              </p>
              <p className="small muted no-margin">{scheduleText(scheduleByGroup[g.id]) || 'Bez termina'}</p>
              <p className="small no-margin">
                {g.monthly_price} RSD mesečno{g.capacity != null ? ` · do ${g.capacity} članova` : ''}
              </p>
            </div>
            <div className="row">
              <button className="btn-ghost btn-sm" onClick={() => startEdit(g)}>Izmeni</button>
              {!g.active && <button className="btn-danger btn-sm" onClick={() => deleteGroup(g)}>Obriši trajno</button>}
            </div>
          </div>
        )
      ))}

      <p className="small muted mt">
        Prijave se otvaraju i zatvaraju za svaku grupu i mesec posebno, u tabu „Termini i uplate".
      </p>
    </div>
  )
}
