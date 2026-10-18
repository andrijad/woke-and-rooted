import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'
import { formatEventDates, isPastEvent, todayLocal } from '../../lib/events'
import { formatDateTime } from '../../lib/oneOnOne'

function monthLabel(period) {
  const t = new Date(period + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function HistoryCard() {
  const { profile } = useAuth()
  const [yoga, setYoga] = useState([])
  const [workshops, setWorkshops] = useState([])
  const [sessions, setSessions] = useState([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const today = todayLocal()
      const monthStart = today.slice(0, 8) + '01'
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
      const [{ data: m }, { data: e }, { data: o }] = await Promise.all([
        supabase.from('monthly_signups').select('id, period, group_name, groups(name)')
          .eq('member_id', profile.id).lt('period', monthStart).order('period', { ascending: false }),
        supabase.from('event_signups').select('id, event_name, event_date_from, event_date_to, events(name, date_from, date_to, start_time, end_time)')
          .eq('member_id', profile.id),
        supabase.from('one_on_one_requests').select('id, session_type, status, scheduled_at')
          .eq('member_id', profile.id).in('status', ['scheduled', 'paid']).order('scheduled_at', { ascending: false })
      ])
      if (cancelled) return
      setYoga(m || [])
      const ws = (e || []).map(s => {
        const src = s.events || { name: s.event_name, date_from: s.event_date_from, date_to: s.event_date_to }
        return { id: s.id, ev: src }
      }).filter(x => x.ev.date_from && isPastEvent(x.ev, today))
        .sort((a, b) => (a.ev.date_from < b.ev.date_from ? 1 : -1))
      setWorkshops(ws)
      setSessions((o || []).filter(r => r.scheduled_at && new Date(r.scheduled_at) < startOfToday))
    }
    load()
    return () => { cancelled = true }
  }, [profile, tick])

  useRefreshOnFocus(() => setTick(t => t + 1))

  if (yoga.length + workshops.length + sessions.length === 0) return null

  return (
    <section className="section">
      <div className="section-title"><h3>Istorija</h3></div>
      <div className="card">
        {yoga.length > 0 && (
          <div className="mb">
            <p className="strong">Joga</p>
            <ul className="history-list">
              {yoga.map(r => (
                <li key={r.id}>{monthLabel(r.period)} · {r.groups?.name || r.group_name || 'Grupa'}</li>
              ))}
            </ul>
          </div>
        )}
        {workshops.length > 0 && (
          <div className="mb">
            <p className="strong">Radionice i događaji</p>
            <ul className="history-list">
              {workshops.map(w => (
                <li key={w.id}>{w.ev.name} · {formatEventDates(w.ev)}</li>
              ))}
            </ul>
          </div>
        )}
        {sessions.length > 0 && (
          <div>
            <p className="strong">1 na 1 seanse</p>
            <ul className="history-list">
              {sessions.map(r => (
                <li key={r.id}>{r.session_type} · {formatDateTime(r.scheduled_at)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
