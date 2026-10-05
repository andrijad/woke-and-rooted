export function buildIpsQrString({ accountNumber, recipientName, amount, purposeCode, refCode }) {
  const amountFormatted = amount.toFixed(2).replace('.', ',')
  return [
    'K:PR', 'V:01', 'C:1',
    `R:${accountNumber}`,
    `N:${recipientName}`,
    `I:RSD${amountFormatted}`,
    `SF:${purposeCode}`,
    `RO:${REF_MODEL}${refCode}`
  ].join('|')
}

// Poziv na broj je samo od cifara, model 99 (bez kontrolnih cifara).
// Brojevi člana i događaja dolaze iz baze (profiles.member_no, events.event_no).
export const REF_MODEL = '99'

const pad = (n, len) => String(n).padStart(len, '0')

// mesečna prijava: 1 + GGMM + broj člana
export function makeRefCode(period, memberNo) {
  return `1${period.slice(2, 4)}${period.slice(5, 7)}${pad(memberNo, 4)}`
}

// individualni čas: 2 + GGMMDD + broj člana
export function makeDropinRefCode(sessionDate, memberNo) {
  return `2${sessionDate.slice(2, 4)}${sessionDate.slice(5, 7)}${sessionDate.slice(8, 10)}${pad(memberNo, 4)}`
}

// događaj: 3 + broj događaja + broj člana
export function makeEventRefCode(eventNo, memberNo) {
  return `3${pad(eventNo, 3)}${pad(memberNo, 4)}`
}
