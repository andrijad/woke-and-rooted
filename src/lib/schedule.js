export const WEEKDAY_NAMES = {
  1: 'Ponedeljak', 2: 'Utorak', 3: 'Sreda', 4: 'Četvrtak',
  5: 'Petak', 6: 'Subota', 7: 'Nedelja'
}

function toLocalISODate(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function computeUpcomingSessions(schedule, count = 8) {
  const results = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let i = 0
  while (results.length < count && i < 90) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const isoWeekday = ((d.getDay() + 6) % 7) + 1
    const match = schedule.find(s => s.weekday === isoWeekday)
    if (match) {
      results.push({ date: toLocalISODate(d), start_time: match.start_time, weekday: isoWeekday })
    }
    i++
  }
  return results
}

export function formatSessionLabel(session) {
  const d = new Date(session.date + 'T00:00:00')
  const dayName = WEEKDAY_NAMES[session.weekday]
  const dateLabel = d.toLocaleDateString('sr-Latn-RS', { day: 'numeric', month: 'short' })
  return `${dayName}, ${dateLabel} · ${session.start_time.slice(0, 5)}h`
}