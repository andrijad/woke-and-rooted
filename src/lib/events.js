export function formatEventDates(ev) {
  const fromLabel = new Date(ev.date_from + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' })
  if (!ev.date_to) {
    const timeLabel = ev.start_time && ev.end_time
      ? `${ev.start_time.slice(0, 5)}–${ev.end_time.slice(0, 5)}h`
      : ''
    return timeLabel ? `${fromLabel} · ${timeLabel}` : fromLabel
  }
  const toLabel = new Date(ev.date_to + 'T00:00:00').toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' })
  return `${fromLabel} — ${toLabel}`
}

// Lokalni datum (ne toISOString: UTC pomera dan).
export function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Događaj je prošao od narednog dana posle poslednjeg dana (kraj višednevnog, inače datum događaja).
export function isPastEvent(ev, today = todayLocal()) {
  return (ev.date_to || ev.date_from) < today
}
