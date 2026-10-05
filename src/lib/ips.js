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
// Broj dodeljuje baza (trigger assign_ref_code, jedinstven brojač za ceo sistem).
export const REF_MODEL = '99'
