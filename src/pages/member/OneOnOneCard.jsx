import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'
import { formatDateTime } from '../../lib/oneOnOne'
import PaymentDetails from './PaymentDetails'

export default function OneOnOneCard() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [settings, setSettings] = useState(null)

  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const [{ data }, { data: settingsData }] = await Promise.all([
        supabase.from('one_on_one_requests').select('*').eq('member_id', profile.id).order('created_at', { ascending: false }),
        supabase.from('studio_settings').select('*').eq('id', 1).single()
      ])
      if (cancelled) return
      const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
      // prikazujemo aktivne upite i buduće plaćene termine
      setRows((data || []).filter(r =>
        r.status === 'new' || r.status === 'scheduled' ||
        (r.status === 'paid' && r.scheduled_at && new Date(r.scheduled_at) >= startOfToday)
      ))
      setSettings(settingsData || null)
    }
    load()
    return () => { cancelled = true }
  }, [profile, tick])

  useRefreshOnFocus(() => setTick(t => t + 1))

  return (
    <section className="section">
      <div className="section-title">
        <img src="/brand/nature-terracotta.svg" alt="" />
        <h3>1 na 1 seanse</h3>
      </div>

      {rows.map(r => (
        <div key={r.id} className={`signup ${r.status === 'paid' ? 'is-paid' : r.status === 'scheduled' ? 'is-due' : ''}`}
          style={r.status === 'new' ? { background: 'var(--straw-wash)' } : undefined}>
          <p className="when">{r.session_type}</p>
          {r.status === 'new' && (
            <>
              <h4>Upit je poslat</h4>
              <p style={{ margin: 0 }}>Čeka se dogovor termina. Javićemo ti se.</p>
            </>
          )}
          {r.status === 'scheduled' && (
            <>
              <h4>{formatDateTime(r.scheduled_at)}</h4>
              <p style={{ margin: 0 }}><span className="strong">Termin je dogovoren — čeka se uplata.</span></p>
              <PaymentDetails settings={settings} amount={r.amount} refCode={r.ref_code} />
            </>
          )}
          {r.status === 'paid' && (
            <>
              <h4>{formatDateTime(r.scheduled_at)}</h4>
              <p className="strong" style={{ margin: 0 }}>✓ Uplata je potvrđena</p>
            </>
          )}
        </div>
      ))}

      <div className="offer">
        <p className="small" style={{ margin: '0 0 10px' }}>
          Individualne seanse (psihoterapija, Theta healing i drugo). Pošalji kratak upit, a termin dogovaramo zajedno.
        </p>
        <Link to="/seanse" className="btn-link">Pošalji upit</Link>
      </div>
    </section>
  )
}
