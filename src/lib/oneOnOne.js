export const SESSION_TYPES = ['Psihoterapija', 'Theta healing', 'Ostalo / nisam siguran/na']

export const MODES = [
  { value: 'uzivo', label: 'Uživo' },
  { value: 'online', label: 'Online' },
  { value: 'svejedno', label: 'Svejedno' }
]

export const MODE_LABEL = Object.fromEntries(MODES.map(m => [m.value, m.label]))

export function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const day = d.toLocaleDateString('sr-Latn-RS', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('sr-Latn-RS', { hour: '2-digit', minute: '2-digit' })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} u ${time}h`
}

// vrednost za <input type="datetime-local"> iz ISO trenutka (lokalno vreme)
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function statusUrl(token) {
  return `${window.location.origin}/seanse/status/${token}`
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
