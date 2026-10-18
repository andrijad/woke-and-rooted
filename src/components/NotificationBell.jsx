import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useRefreshOnFocus } from '../lib/useRefreshOnFocus'

function timeLabel(iso) {
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'upravo'
  if (mins < 60) return `pre ${mins} min`
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `danas u ${hh}:${mm}`
  return `${d.getDate()}.${d.getMonth() + 1}. u ${hh}:${mm}`
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export default function NotificationBell() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [readIds, setReadIds] = useState(() => new Set())
  const ref = useRef(null)

  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('id, body, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (!cancelled) setItems(data || [])
    }
    load()
    return () => { cancelled = true }
  }, [profile, tick])

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000)
    return () => clearInterval(t)
  }, [])
  useRefreshOnFocus(() => setTick(x => x + 1))

  const unread = items.filter(n => !readIds.has(n.id))

  function open() {
    if (unread.length === 0) return
    ref.current?.showModal()
  }

  function onClose() {
    // pročitane nestaju iz liste tek kad se modal zatvori
    setItems(prev => prev.filter(n => !readIds.has(n.id)))
    setReadIds(new Set())
  }

  async function markRead(n) {
    if (readIds.has(n.id)) return
    setReadIds(prev => new Set(prev).add(n.id))
    await supabase.from('notifications').delete().eq('id', n.id).select()
  }

  async function markAllRead() {
    const ids = unread.map(n => n.id)
    if (ids.length === 0) return
    setReadIds(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s })
    await supabase.from('notifications').delete().in('id', ids).select()
    ref.current?.close()
  }

  const count = unread.length

  return (
    <>
      <button type="button" className={`bell${count ? ' has' : ''}`} onClick={open}
        aria-label={count ? `Obaveštenja: ${count} nepročitano` : 'Nema novih obaveštenja'}
        title={count ? 'Obaveštenja' : 'Nema novih obaveštenja'}>
        <BellIcon />
        {count > 0 && <span className="bell-count">{count > 9 ? '9+' : count}</span>}
      </button>

      <dialog ref={ref} className="modal notif-modal" onClose={onClose}
        onClick={e => { if (e.target === ref.current) ref.current.close() }}>
        <div className="modal-body">
          <h3 className="notif-title">Obaveštenja</h3>
          {items.length === 0 && <p className="small muted">Nema novih obaveštenja.</p>}
          <ul className="notif-list">
            {items.map(n => {
              const read = readIds.has(n.id)
              return (
                <li key={n.id}>
                  <button type="button" className={`notif${read ? ' is-read' : ''}`} onClick={() => markRead(n)}>
                    <span className="notif-body">{n.body}</span>
                    <span className="notif-time">{read ? 'pročitano' : timeLabel(n.created_at)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="modal-foot">
          {count > 0 && <button type="button" className="btn-ghost" onClick={markAllRead}>Označi sve kao pročitano</button>}
          <button type="button" onClick={() => ref.current.close()}>Zatvori</button>
        </div>
      </dialog>
    </>
  )
}
