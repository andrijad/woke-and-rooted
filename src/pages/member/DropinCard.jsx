import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { buildIpsQrString, makeDropinRefCode } from '../../lib/ips'
import { computeUpcomingSessions, formatSessionLabel } from '../../lib/schedule'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'

function todayLocal() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('sr-Latn-RS', {
    weekday: 'long', day: 'numeric', month: 'short'
  })
}

export default function DropinCard() {
  const { profile } = useAuth()
  const [groups, setGroups] = useState([])
  const [mine, setMine] = useState([])
  const [qrById, setQrById] = useState({})
  const [selectedGroup, setSelectedGroup] = useState('')
  const [sessions, setSessions] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [signingUp, setSigningUp] = useState(false)
  const [error, setError] = useState('')
  const [loadingSessions, setLoadingSessions] = useState(false)

  useEffect(() => { if (profile) load() }, [profile])
  useRefreshOnFocus(() => { if (profile) load() })

  async function load() {
    const [{ data: groupsData }, { data: settingsData }, { data: mineData }] = await Promise.all([
      supabase.from('groups').select('*').eq('active', true).eq('archived', false).order('name'),
      supabase.from('studio_settings').select('*').eq('id', 1).single(),
      supabase.from('dropin_signups')
        .select('*, groups(name)')
        .eq('member_id', profile.id)
        .gte('session_date', todayLocal())
        .order('session_date')
    ])
    setGroups(groupsData || [])
    const rows = mineData || []
    setMine(rows)

    const qrMap = {}
    if (settingsData) {
      for (const r of rows) {
        if (r.status === 'due') {
          const str = buildIpsQrString({
            accountNumber: settingsData.account_number,
            recipientName: settingsData.recipient_name,
            amount: r.amount,
            purposeCode: settingsData.purpose_code,
            refCode: r.ref_code
          })
          qrMap[r.id] = await QRCode.toDataURL(str, { margin: 1, width: 220 })
        }
      }
    }
    setQrById(qrMap)
  }

  async function handleGroupChange(groupId) {
    setSelectedGroup(groupId)
    setSelectedDate('')
    setSessions([])
    if (!groupId) return
    setLoadingSessions(true)
    const [{ data: scheduleData }, { data: myDropins }] = await Promise.all([
      supabase.from('group_schedule').select('*').eq('group_id', groupId),
      supabase.from('dropin_signups').select('session_date').eq('group_id', groupId).eq('member_id', profile.id)
    ])
    const taken = new Set((myDropins || []).map(d => d.session_date))
    const upcoming = computeUpcomingSessions(scheduleData || [], 10).filter(s => !taken.has(s.date))
    setSessions(upcoming)
    setLoadingSessions(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedGroup || !selectedDate) return
    setSigningUp(true)
    setError('')
    const group = groups.find(g => g.id === selectedGroup)
    const refCode = makeDropinRefCode(selectedDate, profile.id, selectedGroup)

    const { error: err } = await supabase.from('dropin_signups').insert({
      group_id: selectedGroup,
      member_id: profile.id,
      session_date: selectedDate,
      amount: group.dropin_price,
      ref_code: refCode,
      status: 'due'
    })

    if (err) {
      setError(
        err.message.includes('već mesečno')
          ? 'Već si mesečno prijavljena za ovu grupu u tom mesecu — individualni čas nije potreban.'
          : err.code === '23505'
            ? 'Već si prijavljena za taj termin.'
            : 'Došlo je do greške. Pokušaj ponovo.'
      )
    } else {
      setSelectedGroup('')
      setSelectedDate('')
      setSessions([])
      await load()
    }
    setSigningUp(false)
  }

  async function handleCancel(row) {
    if (!confirm('Poništiti prijavu?')) return
    const { data, error: err } = await supabase.from('dropin_signups').delete().eq('id', row.id).select()
    if (err) alert('Greška: ' + err.message)
    else if (!data || data.length === 0) alert('Prijava nije poništena (možda je uplata već potvrđena ili nedostaje pravilo u bazi).')
    await load()
  }

  return (
    <section className="section">
      <div className="section-title">
        <img src="/brand/nature-terracotta.svg" alt="" />
        <h3>Individualni čas</h3>
      </div>

      {mine.map(r => (
        <div key={r.id} className={`signup ${r.status === 'paid' ? 'is-paid' : 'is-due'}`}>
          <p className="when">{formatDate(r.session_date)}</p>
          <h4>{r.groups?.name}</h4>
          {r.status === 'paid' && (
            <p className="strong" style={{ margin: 0 }}>✓ Prijavljena si i uplata je potvrđena</p>
          )}
          {r.status === 'due' && (
            <div>
              <p style={{ margin: '0 0 8px' }}>
                Prijavljena si. Čeka se uplata: <span className="strong">{r.amount} RSD</span>.<br />
                <span className="small muted">Poziv na broj: {r.ref_code}</span>
              </p>
              {qrById[r.id] && (
                <div className="qr"><img src={qrById[r.id]} alt="IPS QR kod" width={200} height={200} /></div>
              )}
              <div>
                <button className="btn-ghost btn-sm" onClick={() => handleCancel(r)}>Poništi prijavu</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <form className="offer" onSubmit={handleSubmit}>
        <p className="strong" style={{ margin: '0 0 4px' }}>Prijavi se na pojedinačni čas</p>
        <select className="field" value={selectedGroup} onChange={e => handleGroupChange(e.target.value)} required>
          <option value="">— izaberi grupu —</option>
          {groups.map(g => (
            <option key={g.id} value={g.id}>{g.name} · {g.dropin_price} RSD</option>
          ))}
        </select>

        {selectedGroup && loadingSessions && <p className="muted small">Učitavanje termina...</p>}

        {selectedGroup && !loadingSessions && sessions.length === 0 && (
          <p className="small error">Nema slobodnih termina za ovu grupu.</p>
        )}

        {sessions.length > 0 && (
          <select className="field" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} required>
            <option value="">— izaberi termin —</option>
            {sessions.map(s => (
              <option key={s.date} value={s.date}>{formatSessionLabel(s)}</option>
            ))}
          </select>
        )}

        <button type="submit" disabled={signingUp || !selectedDate}>Prijavi se</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
