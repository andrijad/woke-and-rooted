export const PASSWORD_HINT = 'Najmanje 8 karaktera, sa malim i velikim slovom i brojem.'

// Vraća poruku greške ili '' ako je lozinka ispravna.
export function checkPassword(p) {
  if (p.length < 8) return 'Lozinka mora imati najmanje 8 karaktera.'
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p)) {
    return 'Lozinka mora imati malo slovo, veliko slovo i broj.'
  }
  return ''
}
