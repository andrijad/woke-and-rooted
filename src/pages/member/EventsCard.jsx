import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { buildIpsQrString, makeEventRefCode } from '../../lib/ips'
import { formatEventDates } from '../../lib/events'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'

export default function EventsCard() {
  const { profile } = useAuth()
  const [events, setEvents] = useState([])
  const [mineByEvent, setMineByEvent] = useState({})
  const [countByEvent, setCountByEvent] = useState({})
  const [qrByEvent, setQrByEvent] = useState({})
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

      const qrMap = {}
      if (settingsData) {
        for (const ev of list) {
          const myRow = mine[ev.id]
          if (myRow && myRow.status === 'due') {
            const str = buildIpsQrString({
              accountNumber: settingsData.account_number,
              recipientName: settingsData.recipient_name,
              amount: myRow.amount,
              purposeCode: settingsData.purpose_code,
              refCode: myRow.ref_code
            })
            qrMap[ev.id] = await QRCode.toDataURL(str, { margin: 1, width: 220 })
          }
        }
      }
      setQrByEvent(qrMap)
    }
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

  return (
    <section className="section">
      <div className="section-title">
        <img src="/brand/cocoa.svg" alt="" />
        <h3>Posebni događaji</h3>
      </div>
      {events.map(ev => {
        const mine = mineByEvent[ev.id]
        const count = countByEvent[ev.id] || 0
        const isFull = ev.capacity != null && count >= ev.capacity && !mine
        const cls = mine ? (mine.status === 'paid' ? 'signup is-paid' : 'signup is-due') : 'offer'

        return (
          <div key={ev.id} className={cls}>
            <h4>{ev.name}</h4>
            <p className={mine ? 'when' : 'small muted'} style={{ margin: '0 0 8px' }}>
              {formatEventDates(ev)} · {ev.price} RSD
            </p>
            {ev.description_short && <p className="small">{ev.description_short}</p>}

            {!mine && !isFull && (
              <button onClick={() => handleSignup(ev)} disabled={signingUp === ev.id}>Prijavi se</button>
            )}

            {!mine && isFull && <span className="badge clay">Grupa je popunjena</span>}

            {mine && mine.status === 'paid' && (
              <p className="strong" style={{ margin: 0 }}>✓ Prijavljena si i uplata je potvrđena</p>
            )}

            {mine && mine.status === 'due' && (
              <div>
                <p style={{ margin: '0 0 8px' }}>
                  Prijavljena si. Čeka se uplata.<br />
                  <span className="small muted">Poziv na broj: {mine.ref_code}</span>
                </p>
                {qrByEvent[ev.id] && (
                  <div className="qr"><img src={qrByEvent[ev.id]} alt="IPS QR kod" width={200} height={200} /></div>
                )}
                <div>
                  <button className="btn-ghost btn-sm" onClick={() => handleCancel(ev)}>Poništi prijavu</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
