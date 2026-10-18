import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import SiteLink from '../components/SiteLink'

// Javna stranica za odjavu od masovnih mejlova (link iz mejla). Mejlovi o prijavama i uplatama i dalje stižu.
export default function Unsubscribe() {
  const { token } = useParams()
  const [state, setState] = useState('ask') // ask | out | in | error
  const [busy, setBusy] = useState(false)

  async function set(optOut) {
    setBusy(true)
    const { data, error } = await supabase.rpc('set_email_opt_out', { p_token: token, p_opt_out: optOut })
    setBusy(false)
    if (error || !data) { setState('error'); return }
    setState(optOut ? 'out' : 'in')
  }

  return (
    <div className="shell">
      <header className="topbar">
        <img className="logo" src="/brand/logo-brown.svg" alt="Woke & Rooted" />
      </header>
      <div className="greeting"><h1>Obaveštenja mejlom</h1></div>
      <div className="card">
        {state === 'ask' && (
          <>
            <p>Želiš da ti više ne šaljemo mejlove o novim terminima joge i radionicama?</p>
            <p className="small muted">Mejlovi o tvojim prijavama i uplatama i dalje stižu.</p>
            <button onClick={() => set(true)} disabled={busy}>Ne šalji mi obaveštenja</button>
          </>
        )}
        {state === 'out' && (
          <>
            <p className="strong">Odjava je uspela.</p>
            <p className="small muted">Više nećeš dobijati mejlove o novim terminima. Obaveštenja u aplikaciji ostaju.</p>
            <button className="btn-ghost" onClick={() => set(false)} disabled={busy}>Ipak želim obaveštenja</button>
          </>
        )}
        {state === 'in' && <p className="strong">Ponovo ćeš dobijati obaveštenja o novim terminima.</p>}
        {state === 'error' && <p>Link nije ispravan ili je zastareo.</p>}
      </div>
      <SiteLink />
    </div>
  )
}
