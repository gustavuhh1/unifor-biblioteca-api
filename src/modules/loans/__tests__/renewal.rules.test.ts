import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  nextReturnAtOf,
  renewalDenialOf,
  renewalUpdate,
} from '../rules/renewal.rules.js'
import { NOW } from './loan.fixtures.js'

const DUE = atLocalTime('2026-10-16', '21:55')
const loan = { dueAt: DUE, renewalCount: 0 }
const noQueue = { queueLength: 0 }

describe('motivo de a renovação ser negada (renewalDenialOf)', () => {
  it('pode renovar: dentro do prazo, sem fila e sem renovação usada', () => {
    expect(
      renewalDenialOf({ loan, book: noQueue, maxRenewals: 1, at: NOW }),
    ).toBeNull()
  })

  it('overdue: o vencimento já passou', () => {
    expect(
      renewalDenialOf({
        loan,
        book: noQueue,
        maxRenewals: 1,
        at: atLocalTime('2026-10-17', '08:00'),
      }),
    ).toBe('overdue')
  })

  it('no instante do vencimento ainda não está atrasado', () => {
    expect(
      renewalDenialOf({ loan, book: noQueue, maxRenewals: 1, at: DUE }),
    ).toBeNull()
  })

  it('has_queue: há gente na fila do livro', () => {
    expect(
      renewalDenialOf({
        loan,
        book: { queueLength: 2 },
        maxRenewals: 1,
        at: NOW,
      }),
    ).toBe('has_queue')
  })

  it('already_renewed: a renovação já foi usada', () => {
    expect(
      renewalDenialOf({
        loan: { dueAt: DUE, renewalCount: 1 },
        book: noQueue,
        maxRenewals: 1,
        at: NOW,
      }),
    ).toBe('already_renewed')
  })

  it('respeita maxRenewals de settings', () => {
    expect(
      renewalDenialOf({
        loan: { dueAt: DUE, renewalCount: 1 },
        book: noQueue,
        maxRenewals: 2,
        at: NOW,
      }),
    ).toBeNull()
  })

  it('devolve o primeiro motivo: overdue antes de has_queue antes de already_renewed', () => {
    const overdue = atLocalTime('2026-10-20', '08:00')
    const used = { dueAt: DUE, renewalCount: 1 }

    expect(
      renewalDenialOf({
        loan: used,
        book: { queueLength: 1 },
        maxRenewals: 1,
        at: overdue,
      }),
    ).toBe('overdue')
    expect(
      renewalDenialOf({
        loan: used,
        book: { queueLength: 1 },
        maxRenewals: 1,
        at: NOW,
      }),
    ).toBe('has_queue')
  })
})

describe('o que gravar ao renovar (renewalUpdate)', () => {
  it('guarda o vencimento antigo, põe o novo, sobe a contagem e marca a hora', () => {
    const newDue = atLocalTime('2026-10-30', '21:55')

    expect(renewalUpdate(loan, newDue, NOW)).toEqual({
      originalDueAt: DUE,
      dueAt: newDue,
      renewalCount: 1,
      renewedAt: NOW,
      updatedAt: NOW,
    })
  })
})

describe('próxima devolução do livro (nextReturnAtOf)', () => {
  const copy = (id: string, status: string, dueAt?: Date) =>
    ({ id, status, dueAt }) as Parameters<typeof nextReturnAtOf>[0][number]

  it('é o menor vencimento entre os exemplares emprestados', () => {
    const earlier = atLocalTime('2026-10-20', '21:55')
    const copies = [
      copy('a', 'on_loan', DUE),
      copy('b', 'on_loan', earlier),
      copy('c', 'available'),
    ]

    expect(
      nextReturnAtOf(copies, {
        copyId: 'a',
        dueAt: atLocalTime('2026-10-30', '21:55'),
      }),
    ).toEqual(earlier)
  })

  it('usa o novo vencimento do exemplar renovado no lugar do antigo', () => {
    const copies = [copy('a', 'on_loan', DUE), copy('b', 'available')]
    const renewedDue = atLocalTime('2026-10-30', '21:55')

    expect(nextReturnAtOf(copies, { copyId: 'a', dueAt: renewedDue })).toEqual(
      renewedDue,
    )
  })

  it('na devolução, o exemplar devolvido deixa de contar', () => {
    const other = atLocalTime('2026-10-20', '21:55')
    const copies = [copy('a', 'on_loan', DUE), copy('b', 'on_loan', other)]

    expect(nextReturnAtOf(copies, { copyId: 'a', dueAt: undefined })).toEqual(
      other,
    )
  })

  it('devolvido o único exemplar emprestado, não sobra próxima devolução', () => {
    const copies = [copy('a', 'on_loan', DUE), copy('b', 'available')]

    expect(
      nextReturnAtOf(copies, { copyId: 'a', dueAt: undefined }),
    ).toBeUndefined()
  })

  it('na retirada, o exemplar separado passa a contar com o vencimento novo', () => {
    const copies = [copy('a', 'reserved'), copy('b', 'available')]

    expect(nextReturnAtOf(copies, { copyId: 'a', dueAt: DUE })).toEqual(DUE)
  })

  it('ignora exemplar que não está emprestado', () => {
    const copies = [
      copy('a', 'on_loan', DUE),
      copy('b', 'reserved', atLocalTime('2026-10-01', '10:00')),
    ]

    expect(nextReturnAtOf(copies, { copyId: 'a', dueAt: DUE })).toEqual(DUE)
  })
})
