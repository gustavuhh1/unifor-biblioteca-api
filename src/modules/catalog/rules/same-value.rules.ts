// Diz se um campo do livro está vazio: ausente, nulo, texto em branco ou lista
// sem itens. O número 0 não é vazio.
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

// Compara dois valores de campo do livro (texto, número ou lista de textos).
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i])
  }
  return a === b
}
