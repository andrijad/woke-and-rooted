// Srpske poruke umesto ugrađenih (engleskih) poruka pregledača za HTML validaciju polja.
function messageFor(el) {
  const v = el.validity
  if (v.valueMissing) {
    if (el.type === 'checkbox') return 'Potvrdi da bi nastavio/la.'
    if (el.type === 'radio') return 'Izaberi jednu opciju.'
    if (el.tagName === 'SELECT') return 'Izaberi stavku sa liste.'
    return 'Popuni ovo polje.'
  }
  if (v.typeMismatch) {
    if (el.type === 'email') return 'Unesi ispravnu email adresu, npr. ime@domen.com.'
    if (el.type === 'url') return 'Unesi ispravan link.'
    return 'Unesi ispravnu vrednost.'
  }
  if (v.tooShort) return `Unesi najmanje ${el.minLength} karaktera.`
  if (v.tooLong) return `Unesi najviše ${el.maxLength} karaktera.`
  if (v.patternMismatch) return 'Format nije ispravan.'
  if (v.rangeUnderflow) return `Vrednost mora biti najmanje ${el.min}.`
  if (v.rangeOverflow) return `Vrednost mora biti najviše ${el.max}.`
  if (v.badInput) return 'Unesi ispravnu vrednost.'
  return ''
}

export function installSerbianValidation() {
  document.addEventListener('invalid', e => {
    const msg = messageFor(e.target)
    if (msg) e.target.setCustomValidity(msg)
  }, true)
  const clear = e => {
    if (e.target.setCustomValidity) e.target.setCustomValidity('')
  }
  document.addEventListener('input', clear, true)
  document.addEventListener('change', clear, true)
}
