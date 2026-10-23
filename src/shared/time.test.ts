import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOverdue, now } from './time.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('agora das regras de negócio (now)', () => {
  it('devolve o instante atual', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z'))

    expect(now()).toEqual(new Date('2026-10-21T15:00:00Z'))
  })
})

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
