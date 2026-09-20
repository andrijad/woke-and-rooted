import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function Payments() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('monthly_signups')
      .select('id, period, amount, status, ref_code, profiles(full_name), groups(name)')
      .order('period', { ascending: false })
    if (error) console.error(error)
    setRows(data || [])
    setLoading(false)
  }

  async function togglePaid(row) {
    const newStatus = row.status === 'paid' ? 'due' : 'paid'
    const { error } = await supabase
      .from('monthly_signups')
      .update({ status: newStatus })
      .eq('id', row.id)
    if (error) alert('Greška: ' + error.message)
    await load()
  }

  if (loading) return <p>Učitavanje...</p>
  if (rows.length === 0) return <p>Nema još mesečnih prijava.</p>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
          <th style={{ padding: 8 }}>Član</th>
          <th style={{ padding: 8 }}>Grupa</th>
          <th style={{ padding: 8 }}>Period</th>
          <th style={{ padding: 8 }}>Iznos</th>
          <th style={{ padding: 8 }}>Poziv na broj</th>
          <th style={{ padding: 8 }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8 }}>{r.profiles?.full_name || '—'}</td>
            <td style={{ padding: 8 }}>{r.groups?.name || '—'}</td>
            <td style={{ padding: 8 }}>{r.period}</td>
            <td style={{ padding: 8 }}>{r.amount} RSD</td>
            <td style={{ padding: 8 }}>{r.ref_code}</td>
            <td style={{ padding: 8 }}>
              <button onClick={() => togglePaid(r)}>
                {r.status === 'paid' ? '✓ Plaćeno' : 'Potvrdi uplatu'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}