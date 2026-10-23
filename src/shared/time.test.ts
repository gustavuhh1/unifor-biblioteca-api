import { describe, expect, it } from 'vitest'
import { isOverdue } from './time.js'

describe('atraso do empréstimo (isOverdue)', () => {
  const dueAt = new Date('2026-10-20T00:55:00Z')

  it('está atrasado depois do vencimento', () => {
    expect(isOverdue(dueAt, new Date('2026-10-20T00:55:01Z'))).toBe(true)
  })

  it('não está atrasado antes do vencimento nem no instante dele', () => {
    expect(isOverdue(dueAt, new Date('2026-10-20T00:54:59Z'))).toBe(false)
    expect(isOverdue(dueAt, dueAt)).toBe(false)
  })
})
