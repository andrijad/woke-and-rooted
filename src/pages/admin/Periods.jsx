import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

function nextMonthDate() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export default function Periods() {
  const { profile } = useAuth()
  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('signup_periods').select('*').order('period', { ascending: false })
    setPeriods(data || [])
    setLoading(false)
  }

  const next = nextMonthDate()
  const alreadyOpen = periods.some(p => p.period === next)

  async function openNext() {
    setOpening(true)
    const { error } = await supabase.from('signup_periods').insert({
      period: next,
      opened_by: profile.id
    })
    if (error) {
      alert('Greška: ' + error.message)
    } else {
      await supabase.from('notifications').insert({
        type: 'month_opened',
        title: `Otvorene prijave za ${next}`,
        body: 'Prijavi se za sledeći mesec redovne joge.',
        created_by: profile.id
      })
    }
    await load()
    setOpening(false)
  }

  if (loading) return <p>Učitavanje...</p>

  return (
    <div>
      <h3 style={{ fontSize: 15 }}>Sledeći period: {next}</h3>
      {alreadyOpen
        ? <p>Prijave za ovaj mesec su već otvorene.</p>
        : <button onClick={openNext} disabled={opening}>Otvori prijave i obavesti članove</button>}

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Istorija</h3>
      <ul>
        {periods.map(p => <li key={p.id}>{p.period}</li>)}
      </ul>
    </div>
  )
}