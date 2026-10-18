import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRefreshOnFocus } from '../../lib/useRefreshOnFocus'
import { MODE_LABEL, SESSION_TYPES, formatDateTime, toLocalInput, statusUrl, copyText } from '../../lib/oneOnOne'
import { errMsg } from '../../lib/errors'

const GROUPS = [
  { status: 'new', title: 'Novi upiti', empty: 'Nema novih upita.' },
  { status: 'scheduled', title: 'Čeka uplatu', empty: 'Nema zakazanih termina bez uplate.' },
  { status: 'paid', title: 'Plaćeno', empty: 'Još nema plaćenih seansi.' }
]

export default function OneOnOneManager() {
  const [rows, setRows] = useState([])
  const [priceInfo, setPriceInfo] = useState({})
  const [priceMsg, setPriceMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCancelled, setShowCancelled] = useState(false)

  useEffect(() => { load() }, [])
  useRefreshOnFocus(() => load(true))

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const [{ data }, { data: s }] = await Promise.all([
      supabase.from('one_on_one_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('studio_settings').select('session_price_info').eq('id', 1).single()
    ])
    setRows(data || [])
    if (!silent) setPriceInfo(s?.session_price_info || {})
    setLoading(false)
  }

  async function savePrices(e) {
    e.preventDefault()
    setPriceMsg('')
    const clean = {}
    for (const t of SESSION_TYPES) if ((priceInfo[t] || '').trim()) clean[t] = priceInfo[t].trim()
    const { data, error } = await supabase.from('studio_settings').update({ session_price_info: clean }).eq('id', 1).select()
    if (error) return setPriceMsg('Greška: ' + errMsg(error))
    if (!data?.length) return setPriceMsg('Čuvanje nije uspelo.')
    setPriceMsg('Sačuvano.')
  }

  if (loading) return <p className="muted">Učitavanje...</p>

  const byStatus = s => rows.filter(r => r.status === s)

  return (
    <div>
      <form className="card" onSubmit={savePrices}>
        <h4 style={{ marginBottom: 6 }}>Okvirne cene</h4>
        <p className="small muted">
          Prikazuju se u formi za upit pored izabrane vrste seanse (npr. „6.000 RSD po satu“). Prazno = ne prikazuje se.
          Tačan iznos upisuješ pri zakazivanju svakog termina.
        </p>
        {SESSION_TYPES.map(t => (
          <label key={t} className="lbl">{t}
            <input className="field" value={priceInfo[t] || ''} placeholder="npr. 6.000 RSD po satu"
              onChange={e => setPriceInfo({ ...priceInfo, [t]: e.target.value })} />
          </label>
        ))}
        <div className="row mt">
          <button type="submit" className="btn-sm">Sačuvaj cene</button>
          {priceMsg && <span className="small muted">{priceMsg}</span>}
        </div>
      </form>

      {GROUPS.map(g => {
        const list = byStatus(g.status)
        return (
          <section key={g.status} className="section">
            <h3>{g.title}{list.length > 0 && <span className="badge" style={{ marginLeft: 10 }}>{list.length}</span>}</h3>
            {list.length === 0 && <p className="small muted">{g.empty}</p>}
            {list.map(r => <RequestCard key={r.id} r={r} onChanged={() => load(true)} />)}
          </section>
        )
      })}

      <label className="check small mt">
        <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} /> Prikaži otkazane
      </label>
      {showCancelled && byStatus('cancelled').map(r => (
        <RequestCard key={r.id} r={r} onChanged={() => load(true)} />
      ))}
    </div>
  )
}

function RequestCard({ r, onChanged }) {
  const [when, setWhen] = useState(toLocalInput(r.scheduled_at))
  const [amount, setAmount] = useState(r.amount != null ? String(r.amount) : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)

  async function update(patch) {
    setBusy(true); setMsg('')
    const { data, error } = await supabase.from('one_on_one_requests').update(patch).eq('id', r.id).select()
    setBusy(false)
    if (error || !data?.length) { setMsg('Izmena nije uspela.'); return }
    onChanged()
  }

  function schedule() {
    if (!when) return setMsg('Izaberi datum i sat.')
    const value = Math.round(Number(amount))
    if (amount === '' || !Number.isFinite(value) || value <= 0) return setMsg('Upiši iznos za ovu seansu (RSD).')
    if (r.status === 'new') {
      update({ status: 'scheduled', scheduled_at: new Date(when).toISOString(), amount: value })
    } else {
      update({ scheduled_at: new Date(when).toISOString(), amount: value })
    }
  }

  async function remove() {
    if (!confirm(`Obrisati upit od ${r.full_name}?`)) return
    setBusy(true)
    const { data, error } = await supabase.from('one_on_one_requests').delete().eq('id', r.id).select()
    setBusy(false)
    if (error || !data?.length) return setMsg('Brisanje nije uspelo.')
    onChanged()
  }

  async function copyLink() {
    const ok = await copyText(statusUrl(r.access_token))
    setCopied(ok); setTimeout(() => setCopied(false), 1500)
  }

  const received = new Date(r.created_at).toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="card">
      <div className="row between">
        <h4 style={{ margin: 0 }}>{r.full_name}</h4>
        <span className="xs muted">Primljeno {received}</span>
      </div>
      <p className="small" style={{ margin: '4px 0 8px' }}>
        <a href={`mailto:${r.email.replace(/[?&#\s]/g, '')}`}>{r.email}</a>
        {r.phone && <> · <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a></>}
        {r.member_id ? <span className="badge moss" style={{ marginLeft: 8 }}>član</span> : <span className="badge" style={{ marginLeft: 8 }}>gost</span>}
      </p>

      <dl className="qa">
        <div><dt>Vrsta</dt><dd>{r.session_type}</dd></div>
        <div><dt>Do sada</dt><dd>{r.first_time ? 'Prvi put' : 'Već bio/la'}</dd></div>
        <div><dt>Način</dt><dd>{MODE_LABEL[r.mode] || r.mode}</dd></div>
        {r.preferred_times && <div><dt>Poželjno vreme</dt><dd>{r.preferred_times}</dd></div>}
        <div><dt>Tema</dt><dd className="pre">{r.topic}</dd></div>
        {r.message && <div><dt>Poruka</dt><dd className="pre">{r.message}</dd></div>}
      </dl>

      {r.status === 'scheduled' && (
        <p className="small" style={{ margin: '8px 0 0' }}>
          <span className="strong">{formatDateTime(r.scheduled_at)}</span> · {r.amount} RSD · poziv na broj <span className="strong">{r.ref_code}</span>
        </p>
      )}
      {r.status === 'paid' && (
        <p className="small" style={{ margin: '8px 0 0' }}>
          <span className="strong">{formatDateTime(r.scheduled_at)}</span> · {r.amount} RSD · poziv na broj {r.ref_code}
        </p>
      )}

      {(r.status === 'new' || r.status === 'scheduled') && (
        <div className="row mt">
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} aria-label="Termin" />
          <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="Iznos" aria-label="Iznos (RSD)" style={{ width: 120 }} />
          <span className="small muted">RSD</span>
          <button className="btn-sm" disabled={busy} onClick={schedule}>
            {r.status === 'new' ? 'Zakaži' : 'Sačuvaj izmenu'}
          </button>
        </div>
      )}

      <div className="row mt">
        {r.status === 'scheduled' && (
          <button className="btn-sm" disabled={busy} onClick={() => update({ status: 'paid' })}>Potvrdi uplatu</button>
        )}
        {r.status === 'paid' && (
          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => update({ status: 'scheduled' })}>Poništi potvrdu uplate</button>
        )}
        <button className="btn-ghost btn-sm" onClick={copyLink}>{copied ? '✓ Kopirano' : 'Kopiraj link za status'}</button>
        {r.status !== 'cancelled' && (
          <button className="btn-ghost btn-sm" disabled={busy}
            onClick={() => confirm('Otkazati ovaj upit?') && update({ status: 'cancelled' })}>Otkaži</button>
        )}
        {r.status === 'cancelled' && (
          <button className="btn-ghost btn-sm" disabled={busy}
            onClick={() => update({ status: 'new', scheduled_at: null, amount: null })}>Vrati u nove</button>
        )}
        <button className="btn-danger btn-sm" disabled={busy} onClick={remove}>Obriši</button>
      </div>
      {msg && <p className="small error" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  )
}
