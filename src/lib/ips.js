export function buildIpsQrString({ accountNumber, recipientName, amount, purposeCode, refCode }) {
  const amountFormatted = amount.toFixed(2).replace('.', ',')
  return [
    'K:PR', 'V:01', 'C:1',
    `R:${accountNumber}`,
    `N:${recipientName}`,
    `I:RSD${amountFormatted}`,
    `SF:${purposeCode}`,
    `RO:${refCode}`
  ].join('|')
}

export function makeRefCode(period, memberId) {
  const yy = period.slice(2, 4)
  const mm = period.slice(5, 7)
  const suffix = memberId.replace(/-/g, '').slice(-4).toUpperCase()
  return `${yy}${mm}-${suffix}`
}

export function makeDropinRefCode(sessionDate, memberId, groupId) {
  const yy = sessionDate.slice(2, 4)
  const mm = sessionDate.slice(5, 7)
  const dd = sessionDate.slice(8, 10)
  const memberSuffix = memberId.replace(/-/g, '').slice(-3).toUpperCase()
  const groupSuffix = groupId.replace(/-/g, '').slice(-2).toUpperCase()
  return `${yy}${mm}${dd}-${memberSuffix}${groupSuffix}`
}

export function makeEventRefCode(eventId, memberId) {
  const eventSuffix = eventId.replace(/-/g, '').slice(-4).toUpperCase()
  const memberSuffix = memberId.replace(/-/g, '').slice(-3).toUpperCase()
  return `DOG-${eventSuffix}${memberSuffix}`
}