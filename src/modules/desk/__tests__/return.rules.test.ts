import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import { NOW } from '../../loans/__tests__/loan.fixtures.js'
import { booksReadAfterReturn, returnFields } from '../rules/return.rules.js'

describe('o que gravar na devolução (returnFields)', () => {
  it('o empréstimo vira devolvido, com a hora e quem recebeu o livro', () => {
    expect(returnFields({ librarianUid: 'uid_ana', at: NOW })).toEqual({
      status: 'returned',
      returnedAt: NOW,
      returnedTo: 'uid_ana',
      updatedAt: NOW,
    })
  })
})

describe('livros lidos no ano (booksReadAfterReturn)', () => {
  it('soma 1 ao ano da devolução e mantém os outros anos', () => {
    expect(booksReadAfterReturn({ '2025': 9, '2026': 17 }, NOW)).toEqual({
      '2025': 9,
      '2026': 18,
    })
  })

  it('começa o ano em 1 quando ainda não havia contagem', () => {
    expect(booksReadAfterReturn({}, NOW)).toEqual({ '2026': 1 })
  })

  it('não altera o objeto recebido', () => {
    const current = { '2026': 17 }

    booksReadAfterReturn(current, NOW)

    expect(current).toEqual({ '2026': 17 })
  })

  it('o ano é o de Fortaleza: 22h do dia 31/12 ainda é 2026, mesmo já sendo 2027 em UTC', () => {
    const at = new Date('2027-01-01T01:00:00Z')

    expect(booksReadAfterReturn({}, at)).toEqual({ '2026': 1 })
    expect(
      booksReadAfterReturn({}, atLocalTime('2027-01-01', '08:00')),
    ).toEqual({ '2027': 1 })
  })
})
