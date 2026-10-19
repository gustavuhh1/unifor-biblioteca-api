// O Firestore devolve um Timestamp; os testes e o código que monta um documento
// usam Date. Esta função aceita os dois.
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate() as Date
  }
  throw new Error('Era esperada uma data no documento.')
}

// Igual a toDate, mas campo ausente ou nulo vira null.
export function optionalDate(value: unknown): Date | null {
  return value === undefined || value === null ? null : toDate(value)
}
