// Ime za prikaz članu: nadimak ako postoji, inače ime i prezime.
export function displayName(p, fallback = '') {
  return p?.nickname?.trim() || p?.full_name || fallback
}

// Ime za vlasnicu: puno ime, a nadimak u zagradi.
export function ownerName(p, fallback = '—') {
  if (!p?.full_name) return fallback
  return p.nickname?.trim() ? `${p.full_name} (${p.nickname.trim()})` : p.full_name
}
