import { useEffect, useState } from 'react'
import HomeLogo from '../components/HomeLogo'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatDateTime } from '../lib/oneOnOne'
import PaymentDetails from './member/PaymentDetails'
import SiteLink from '../components/SiteLink'

// Javna stranica statusa za goste: pristup samo preko privatnog tokena iz linka.
export default function OneOnOneStatus() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, row: null })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase.rpc('get_one_on_one_status', { p_token: token })
      if (cancelled) return
      setState({ loading: false, row: error ? null : data?.[0] || null })
    }
    load()
    return () => { cancelled = true }
  }, [token])

  const r = state.row
  const settings = r?.account_number
    ? { account_number: r.account_number, recipient_name: r.recipient_name, purpose_code: r.purpose_code }
    : null

  return (
    <div className="shell">
      <header className="topbar">
        <HomeLogo />
        <Link to="/seanse" className="back">Novi upit</Link>
      </header>
      <div className="greeting"><h1>Status upita</h1></div>

      {state.loading && <p className="muted">Učitavanje...</p>}
      {!state.loading && !r && (
        <div className="card"><p>Upit nije pronađen. Proveri da li je link kompletan.</p></div>
      )}

      {r && r.status === 'new' && (
        <div className="notice">
          <p className="strong" style={{ margin: '0 0 4px' }}>Upit je primljen.</p>
          Javićemo ti se da dogovorimo termin. Ovde će se pojaviti podaci za uplatu čim termin bude zakazan.
        </div>
      )}

      {r && r.status === 'scheduled' && (
        <div className="signup is-due">
          <p className="when">{r.session_type}</p>
          <h4>{formatDateTime(r.scheduled_at)}</h4>
          <p style={{ margin: 0 }}><span className="strong">Termin je dogovoren — čeka se uplata.</span></p>
          <PaymentDetails settings={settings} amount={r.amount} refCode={r.ref_code} />
        </div>
      )}

      {r && r.status === 'paid' && (
        <div className="signup is-paid">
          <p className="when">{r.session_type}</p>
          <h4>{formatDateTime(r.scheduled_at)}</h4>
          <p className="strong" style={{ margin: 0 }}>✓ Uplata je potvrđena. Vidimo se!</p>
        </div>
      )}

      {r && r.status === 'cancelled' && (
        <div className="notice">Ovaj upit je otkazan. Slobodno pošalji novi.</div>
      )}
      <SiteLink />
    </div>
  )
}
