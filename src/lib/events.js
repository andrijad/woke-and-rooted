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
