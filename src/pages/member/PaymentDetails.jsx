import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildIpsQrString, REF_MODEL } from '../../lib/ips'

function CopyButton({ value }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value))
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch {
      /* clipboard nije dostupan — korisnik može ručno da označi tekst */
    }
  }
  return (
    <button type="button" className="btn-ghost btn-sm copy" onClick={copy}>
      {done ? '✓' : 'Kopiraj'}
    </button>
  )
}

// Uputstvo za uplatu: sklopljeno dok korisnik ne otvori. Unutra su IPS QR
// i isti podaci tekstom (za one koji uplaćuju ručno).
export default function PaymentDetails({ settings, amount, refCode }) {
  const [qr, setQr] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!settings) return
    const str = buildIpsQrString({
      accountNumber: settings.account_number,
      recipientName: settings.recipient_name,
      amount,
      purposeCode: settings.purpose_code,
      refCode
    })
    QRCode.toDataURL(str, { margin: 1, width: 220 }).then(url => { if (!cancelled) setQr(url) })
    return () => { cancelled = true }
  }, [settings, amount, refCode])

  if (!settings) return null

  const rows = [
    { label: 'Primalac', value: settings.recipient_name },
    { label: 'Račun', value: settings.account_number, copy: true },
    { label: 'Iznos', value: `${amount} RSD`, copy: String(amount) },
    { label: 'Šifra plaćanja', value: settings.purpose_code },
    { label: 'Model', value: REF_MODEL },
    { label: 'Poziv na broj', value: refCode, copy: true }
  ]

  return (
    <details className="pay">
      <summary>Kako da uplatiš ({amount} RSD)</summary>
      {qr && (
        <div className="qr">
          <img src={qr} alt="IPS QR kod za uplatu" width={200} height={200} />
        </div>
      )}
      <p className="xs muted" style={{ margin: '0 0 8px' }}>
        Skeniraj kod u mobilnom bankarstvu ili uplati ručno sa podacima ispod.
      </p>
      <dl className="pay-grid">
        {rows.map(r => (
          <div key={r.label} className="pay-row">
            <dt>{r.label}</dt>
            <dd>
              <span>{r.value}</span>
              {r.copy && <CopyButton value={r.copy === true ? r.value : r.copy} />}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
