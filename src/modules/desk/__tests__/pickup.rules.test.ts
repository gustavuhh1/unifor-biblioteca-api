import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import type { StudentCirculation } from '../../../shared/rules/request-eligibility.js'
import { NOW } from '../../loans/__tests__/loan.fixtures.js'
import { pickupDenialOf, pickupFields } from '../rules/pickup.rules.js'

const loan = { pickupDeadline: atLocalTime('2026-10-19', '21:55') }

function student(
  openLoans: StudentCirculation['openLoans'] = [],
): StudentCirculation {
  return { activeLoanCount: openLoans.length, activeQueueCount: 0, openLoans }
}

describe('quando a retirada é recusada (pickupDenialOf, RF-BAL-02)', () => {
  it('dentro do prazo e sem atraso, pode retirar', () => {
    expect(pickupDenialOf({ loan, student: student(), at: NOW })).toBeNull()
  })

  it('no último instante do prazo ainda pode retirar', () => {
    expect(
      pickupDenialOf({ loan, student: student(), at: loan.pickupDeadline }),
    ).toBeNull()
  })

  it('expired: o prazo de retirada já passou', () => {
    expect(
      pickupDenialOf({
        loan,
        student: student(),
        at: atLocalTime('2026-10-19', '21:56'),
      }),
    ).toBe('expired')
  })

  it('overdue: o aluno tem empréstimo ativo com o vencimento passado (RF-EMP-04)', () => {
    const late = student([
      {
        bookId: 'b',
        workId: 'w',
        status: 'active',
        dueAt: atLocalTime('2026-10-14', '21:55'),
      },
    ])

    expect(pickupDenialOf({ loan, student: late, at: NOW })).toBe('overdue')
  })

  it('empréstimo que vence em breve ou pedido para retirar não bloqueiam', () => {
    const fine = student([
      {
        bookId: 'b',
        workId: 'w',
        status: 'active',
        dueAt: atLocalTime('2026-10-16', '21:55'),
      },
      { bookId: 'c', workId: 'x', status: 'awaiting_pickup' },
    ])

    expect(pickupDenialOf({ loan, student: fine, at: NOW })).toBeNull()
  })

  it('o prazo vencido vale mais que o atraso', () => {
    const late = student([
      {
        bookId: 'b',
        workId: 'w',
        status: 'active',
        dueAt: atLocalTime('2026-10-14', '21:55'),
      },
    ])

    expect(
      pickupDenialOf({
        loan,
        student: late,
        at: atLocalTime('2026-10-20', '09:00'),
      }),
    ).toBe('expired')
  })
})

describe('o que gravar na retirada (pickupFields)', () => {
  it('o pedido vira ativo, com a hora, o bibliotecário e o vencimento', () => {
    const dueAt = atLocalTime('2026-10-29', '21:55')

    expect(pickupFields({ librarianUid: 'uid_ana', dueAt, at: NOW })).toEqual({
      status: 'active',
      pickedUpAt: NOW,
      pickedUpBy: 'uid_ana',
      dueAt,
      updatedAt: NOW,
    })
  })
})
