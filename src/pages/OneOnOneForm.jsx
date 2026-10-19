import { useEffect, useState } from 'react'
import Turnstile from '../components/Turnstile'
import { TURNSTILE_SITE_KEY } from '../lib/turnstile'
import HomeLogo from '../components/HomeLogo'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { SESSION_TYPES, MODES, statusUrl, copyText } from '../lib/oneOnOne'
import SiteLink from '../components/SiteLink'

const EMPTY = {
  full_name: null, email: null, phone: null, // null = uzmi iz profila (ako je član ulogovan)
  session_type: SESSION_TYPES[0], first_time: 'yes', topic: '',
  preferred_times: '', mode: 'svejedno', message: '', consent: false,
  website: '' // honeypot — ljudi ga ne vide, botovi popunjavaju
}

export default function OneOnOneForm() {
  const { session, profile } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null) // { token }
  const [copied, setCopied] = useState(false)
  const [priceInfo, setPriceInfo] = useState({})
  const [captcha, setCaptcha] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.rpc('get_session_price_info')
      if (!cancelled && data && typeof data === 'object') setPriceInfo(data)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ulogovan član: ime i kontakt se povlače iz profila dok ih ne izmeni
  const val = k => (form[k] !== null ? form[k] : profile?.[k] || '')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.consent) return setError('Potrebna je saglasnost za obradu podataka.')
    // honeypot: tiho „uspeh“ bez upisa
    if (form.website) { setSent({ token: crypto.randomUUID() }); return }

    if (TURNSTILE_SITE_KEY && !captcha) return setError('Sačekaj da se završi provera „Nisam robot“.')

    setSaving(true)
    const { data, error: err } = await supabase.functions.invoke('submit-session-request', {
      body: {
        captchaToken: captcha,
        full_name: val('full_name').trim(),
        email: val('email').trim(),
        phone: val('phone').trim() || null,
        session_type: form.session_type,
        first_time: form.first_time === 'yes',
        topic: form.topic.trim(),
        preferred_times: form.preferred_times.trim() || null,
        mode: form.mode,
        message: form.message.trim() || null,
        consent: true
      }
    })
    setSaving(false)
    if (err || !data?.token) {
      let code = data?.error
      try { code = code || (await err?.context?.json())?.error } catch { /* nije JSON */ }
      setError(code === 'rate_limit'
        ? 'Trenutno ima previše upita. Pokušaj ponovo malo kasnije.'
        : code === 'captcha'
          ? 'Provera „Nisam robot“ nije uspela. Sačekaj da se završi pa pokušaj ponovo.'
          : 'Slanje nije uspelo. Proveri podatke i pokušaj ponovo.')
      setCaptcha(''); setCaptchaKey(k => k + 1)
      return
    }
    setSent({ token: data.token })
  }

  const back = session ? '/' : '/login'
  const link = sent ? statusUrl(sent.token) : ''

  return (
    <div className="shell">
      <header className="topbar">
        <HomeLogo />
        <Link to={back} className="back">← Nazad</Link>
      </header>

      {sent ? (
        <div className="card">
          <h2>Upit je poslat</h2>
          <p>Hvala! Javićemo ti se da zajedno dogovorimo termin. Posle toga dobijaš podatke za uplatu.</p>
          {session ? (
            <p className="small muted">Status upita možeš da pratiš na početnoj strani.</p>
          ) : (
            <>
              <p className="small">
                <span className="strong">Sačuvaj ovaj link.</span> Preko njega vidiš status upita i, kad se termin
                dogovori, podatke za uplatu. Prijava nije potrebna.
              </p>
              <input className="field" readOnly value={link} onFocus={e => e.target.select()} />
              <div className="row">
                <button type="button" onClick={async () => { setCopied(await copyText(link)); setTimeout(() => setCopied(false), 1500) }}>
                  {copied ? '✓ Kopirano' : 'Kopiraj link'}
                </button>
                <a href={link} className="small">Otvori status</a>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="greeting"><h1>1 na 1 seansa</h1></div>
          <p className="muted">
            Pošalji kratak upit, a mi ti se javljamo da dogovorimo termin. Ne moraš imati nalog.
          </p>

          <form className="card" onSubmit={handleSubmit}>
            <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true"
              value={form.website} onChange={e => set('website', e.target.value)} />

            <label className="lbl">Ime i prezime
              <input className="field" required maxLength={120} value={val('full_name')}
                onChange={e => set('full_name', e.target.value)} />
            </label>
            <label className="lbl">Email
              <input className="field" type="email" required maxLength={200} value={val('email')}
                onChange={e => set('email', e.target.value)} />
            </label>
            <label className="lbl">Telefon (opciono)
              <input className="field" type="tel" maxLength={60} value={val('phone')}
                onChange={e => set('phone', e.target.value)} />
            </label>

            <label className="lbl">Vrsta seanse
              <select className="field" value={form.session_type} onChange={e => set('session_type', e.target.value)}>
                {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            {priceInfo[form.session_type] && (
              <p className="small muted price-hint">Okvirna cena: {priceInfo[form.session_type]}. Tačan iznos dobijaš uz potvrdu termina.</p>
            )}

            <fieldset className="choice">
              <legend>Da li si već bio/la kod nas na seansi?</legend>
              <label><input type="radio" name="first" checked={form.first_time === 'yes'}
                onChange={() => set('first_time', 'yes')} /> Prvi put sam</label>
              <label><input type="radio" name="first" checked={form.first_time === 'no'}
                onChange={() => set('first_time', 'no')} /> Već sam bio/la</label>
            </fieldset>

            <label className="lbl">Šta želiš da obradiš? (kratko)
              <textarea className="field" required rows={4} maxLength={1500} value={form.topic}
                onChange={e => set('topic', e.target.value)} />
            </label>

            <label className="lbl">Poželjni dani i vreme (opciono)
              <input className="field" maxLength={300} placeholder="npr. radnim danima posle 17h"
                value={form.preferred_times} onChange={e => set('preferred_times', e.target.value)} />
            </label>

            <label className="lbl">Način održavanja
              <select className="field" value={form.mode} onChange={e => set('mode', e.target.value)}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>

            <label className="lbl">Dodatna poruka (opciono)
              <textarea className="field" rows={3} maxLength={2000} value={form.message}
                onChange={e => set('message', e.target.value)} />
            </label>

            <label className="check">
              <input type="checkbox" checked={form.consent} onChange={e => set('consent', e.target.checked)} />
              Slažem se da se podaci iz upitnika koriste isključivo za odgovor na moj upit i dogovor termina.
            </label>

            <Turnstile onToken={setCaptcha} resetKey={captchaKey} />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={saving}>{saving ? 'Šaljem...' : 'Pošalji upit'}</button>
          </form>
        </>
      )}
      <SiteLink />
    </div>
  )
}
