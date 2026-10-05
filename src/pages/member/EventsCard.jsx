import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { makeEventRefCode } from '../../lib/ips'
import { sanitizeHtml, hasText } from '../../lib/sanitize'
import PaymentDetails from './PaymentDetails'
import { formatEventDates } from '../../lib/events'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'

export default function EventsCard() {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [mineByEvent, setMineByEvent] = useState({})
  const [countByEvent, setCountByEvent] = useState({})
  const [settings, setSettings] = useState(null)
  const [openEventId, setOpenEventId] = useState(null)
  const [signingUp, setSigningUp] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) load() }, [profile])
  useRefreshOnFocus(() => { if (profile) load(true) })

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const [{ data: eventsData }, { data: settingsData }] = await Promise.all([
      supabase.from('events').select('*').eq('published', true).eq('archived', false).order('date_from'),
      supabase.from('studio_settings').select('*').eq('id', 1).single()
    ])
    const list = eventsData || []
    setEvents(list)

    if (list.length > 0) {
      // RLS pokazuje samo sopstvene prijave — ovo je "da li sam ja prijavljena"
      const { data: mySignupsData } = await supabase
        .from('event_signups')
        .select('event_id, member_id, status, ref_code, amount')
        .in('event_id', list.map(e => e.id))

      const mine = {}
      for (const s of mySignupsData || []) mine[s.event_id] = s
      setMineByEvent(mine)

      // ukupan broj prijava (za kapacitet) ide preko bezbedne funkcije,
      // jer RLS članu ne dozvoljava da vidi tuđe prijave
      const counts = {}
      await Promise.all(list.map(async ev => {
        const { data: count } = await supabase.rpc('count_event_signups', { p_event_id: ev.id })
        counts[ev.id] = count || 0
      }))
      setCountByEvent(counts)

    }
    setSettings(settingsData || null)
    setLoading(false)
  }

  async function handleSignup(ev) {
    setSigningUp(ev.id)
    const refCode = makeEventRefCode(ev.id, profile.id)
    const { error } = await supabase.from('event_signups').insert({
      event_id: ev.id,
      member_id: profile.id,
      amount: ev.price,
      ref_code: refCode,
      status: 'due'
    })
    if (error) alert('Greška: ' + error.message)
    await load(true)
    setSigningUp(null)
  }

  async function handleCancel(ev) {
    if (!confirm('Poništiti prijavu?')) return
    const { data, error } = await supabase
      .from('event_signups')
      .delete()
      .eq('event_id', ev.id)
      .eq('member_id', profile.id)
      .eq('status', 'due')
      .select()
    if (error) alert('Greška: ' + error.message)
    else if (!data || data.length === 0) alert('Prijava nije poništena (možda je uplata već potvrđena ili nedostaje pravilo u bazi).')
    await load(true)
  }

  if (loading) return <p className="muted">Učitavanje...</p>
  if (events.length === 0) return null

  const openEvent = events.find(e => e.id === openEventId) || null

  function renderAction(ev, { inModal = false } = {}) {
    const mine = mineByEvent[ev.id]
    const count = countByEvent[ev.id] || 0
    const isFull = ev.capacity != null && count >= ev.capacity && !mine
    if (!mine && !isFull) {
      return (
        <button disabled={signingUp === ev.id}
          onClick={async () => { await handleSignup(ev); if (inModal) setOpenEventId(null) }}>Prijavi se</button>
      )
    }
    if (!mine && isFull) return <span className="badge clay">Grupa je popunjena</span>
    if (mine.status === 'paid') {
      return <span className="badge moss">✓ Prijavljena si, uplata potvrđena</span>
    }
    return inModal
      ? <span className="badge clay">Prijavljena si — čeka se uplata</span>
      : null
  }

  return (
    <section className="section">
      <div className="section-title">
        <img src="/brand/cocoa.svg" alt="" />
        <h3>Posebni događaji</h3>
      </div>
      {events.map(ev => {
        const mine = mineByEvent[ev.id]
        const cls = mine ? (mine.status === 'paid' ? 'signup is-paid' : 'signup is-due') : 'offer'

        return (
          <div key={ev.id} className={cls}>
            <h4>{ev.name}</h4>
            <p className={mine ? 'when' : 'small muted'} style={{ margin: '0 0 8px' }}>
              {formatEventDates(ev)} · {ev.price} RSD
            </p>
            {ev.description_short && <p className="small">{ev.description_short}</p>}
            {hasText(ev.description_html) && (
              <p style={{ margin: '0 0 10px' }}>
                <button type="button" className={mine?.status === 'paid' ? 'btn-on-moss btn-sm' : 'btn-ghost btn-sm'}
                  onClick={() => setOpenEventId(ev.id)}>Pročitaj više</button>
              </p>
            )}

            {mine?.status === 'due' && (
              <div>
                <p style={{ margin: 0 }}><span className="strong">Prijavljena si — čeka se uplata.</span></p>
                <PaymentDetails settings={settings} amount={mine.amount} refCode={mine.ref_code} />
                <button className="btn-ghost btn-sm" onClick={() => handleCancel(ev)}>Poništi prijavu</button>
              </div>
            )}
            {mine?.status === 'paid' && (
              <p className="strong" style={{ margin: 0 }}>✓ Prijavljena si i uplata je potvrđena</p>
            )}
            {!mine && renderAction(ev)}
          </div>
        )
      })}

      <EventModal event={openEvent} onClose={() => setOpenEventId(null)}
        action={openEvent ? renderAction(openEvent, { inModal: true }) : null} />
    </section>
  )
}

function EventModal({ event, onClose, action }) {
  const ref = useRef(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (event && !d.open) d.showModal()
    if (!event && d.open) d.close()
  }, [event])

  return (
    <dialog ref={ref} className="modal" onClose={onClose}
      onClick={e => { if (e.target === ref.current) ref.current.close() }}>
      {event && (
        <>
          <div className="modal-body">
            <h3 style={{ marginBottom: 4 }}>{event.name}</h3>
            <p className="small muted">{formatEventDates(event)} · {event.price} RSD</p>
            <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeHtml(event.description_html) }} />
          </div>
          <div className="modal-foot">
            {action}
            <button type="button" className="btn-ghost" onClick={() => ref.current.close()}>Zatvori</button>
          </div>
        </>
      )}
    </dialog>
  )
}
