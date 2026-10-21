import { describe, expect, it } from 'vitest'
import {
  checkRequestEligibility,
  DEFAULT_REQUEST_LIMITS,
  suggestedActionOf,
  type EligibilityBook,
  type StudentCirculation,
} from './request-eligibility.js'

const AT = new Date('2026-10-21T15:00:00Z')
const YESTERDAY = new Date('2026-10-20T00:55:00Z')
const NEXT_WEEK = new Date('2026-10-28T00:55:00Z')

const book: EligibilityBook = {
  workId: 'codigo-limpo--martin',
  status: 'active',
  unavailableForNewRequests: false,
  copiesAvailable: 1,
}
const bookWithoutCopies: EligibilityBook = { ...book, copiesAvailable: 0 }

const student: StudentCirculation = {
  activeLoanCount: 3,
  activeQueueCount: 1,
  openLoans: [
    { workId: 'redes--tanenbaum', status: 'active', dueAt: NEXT_WEEK },
  ],
}

type Input = Parameters<typeof checkRequestEligibility>[0]

const request = (overrides: Partial<Input> = {}) =>
  checkRequestEligibility({
    action: 'request',
    book,
    student,
    limits: DEFAULT_REQUEST_LIMITS,
    at: AT,
    ...overrides,
  })

const joinQueue = (overrides: Partial<Input> = {}) =>
  request({ action: 'join_queue', book: bookWithoutCopies, ...overrides })

describe('ação sugerida na página do livro (suggestedActionOf)', () => {
  it('sugere pedir o empréstimo quando há exemplar disponível', () => {
    expect(suggestedActionOf({ copiesAvailable: 2 })).toBe('request')
  })

  it('sugere entrar na fila quando não há exemplar disponível', () => {
    expect(suggestedActionOf({ copiesAvailable: 0 })).toBe('join_queue')
  })
})

describe('elegibilidade do pedido (checkRequestEligibility, request)', () => {
  it('libera o aluno em dia, com limite sobrando e sem o mesmo título', () => {
    expect(request()).toEqual({ allowed: true })
  })

  it('bloqueia o livro marcado como indisponível para novos pedidos', () => {
    expect(
      request({ book: { ...book, unavailableForNewRequests: true } }),
    ).toEqual({ allowed: false, blockedReason: 'unavailable' })
  })

  it('bloqueia o livro removido', () => {
    expect(request({ book: { ...book, status: 'removed' } })).toEqual({
      allowed: false,
      blockedReason: 'unavailable',
    })
  })

  it('bloqueia o aluno com empréstimo ativo atrasado', () => {
    expect(
      request({
        student: {
          ...student,
          openLoans: [
            { workId: 'calculo--stewart', status: 'active', dueAt: YESTERDAY },
          ],
        },
      }),
    ).toEqual({ allowed: false, blockedReason: 'overdue' })
  })

  it('não conta como atraso o pedido por retirar nem o empréstimo no prazo', () => {
    expect(
      request({
        student: {
          ...student,
          openLoans: [
            { workId: 'a', status: 'awaiting_pickup' },
            { workId: 'b', status: 'active', dueAt: AT },
          ],
        },
      }),
    ).toEqual({ allowed: true })
  })

  it('bloqueia quem já tem o mesmo título (pedido ou empréstimo)', () => {
    for (const status of ['awaiting_pickup', 'active'] as const) {
      expect(
        request({
          student: {
            ...student,
            openLoans: [{ workId: book.workId, status, dueAt: NEXT_WEEK }],
          },
        }),
      ).toEqual({ allowed: false, blockedReason: 'same_title' })
    }
  })

  it('bloqueia quem já está no limite de empréstimos', () => {
    expect(request({ student: { ...student, activeLoanCount: 10 } })).toEqual({
      allowed: false,
      blockedReason: 'loan_limit',
    })
  })

  it('usa o limite de settings/library, não um número fixo', () => {
    expect(
      request({ limits: { maxActiveLoans: 3, maxActiveQueues: 7 } }),
    ).toEqual({ allowed: false, blockedReason: 'loan_limit' })
  })

  it('respeita a ordem: unavailable, overdue, same_title, loan_limit', () => {
    const everything: StudentCirculation = {
      activeLoanCount: 10,
      activeQueueCount: 0,
      openLoans: [{ workId: book.workId, status: 'active', dueAt: YESTERDAY }],
    }
    const unavailableBook = { ...book, unavailableForNewRequests: true }

    expect(
      request({ book: unavailableBook, student: everything }).blockedReason,
    ).toBe('unavailable')
    expect(request({ student: everything }).blockedReason).toBe('overdue')
    expect(
      request({
        student: {
          ...everything,
          openLoans: [{ workId: book.workId, status: 'awaiting_pickup' }],
        },
      }).blockedReason,
    ).toBe('same_title')
    expect(
      request({ student: { ...everything, openLoans: [] } }).blockedReason,
    ).toBe('loan_limit')
  })
})

describe('elegibilidade da fila (checkRequestEligibility, join_queue)', () => {
  it('libera o aluno em dia quando não há exemplar disponível', () => {
    expect(joinQueue()).toEqual({ allowed: true })
  })

  it('bloqueia o livro indisponível para novos pedidos', () => {
    expect(
      joinQueue({
        book: { ...bookWithoutCopies, unavailableForNewRequests: true },
      }),
    ).toEqual({ allowed: false, blockedReason: 'unavailable' })
  })

  it('bloqueia o aluno com empréstimo atrasado', () => {
    expect(
      joinQueue({
        student: {
          ...student,
          openLoans: [{ workId: 'x', status: 'active', dueAt: YESTERDAY }],
        },
      }),
    ).toEqual({ allowed: false, blockedReason: 'overdue' })
  })

  it('bloqueia o aluno no limite de filas', () => {
    expect(joinQueue({ student: { ...student, activeQueueCount: 7 } })).toEqual({
      allowed: false,
      blockedReason: 'queue_limit',
    })
  })

  it('só abre a fila sem exemplar disponível (not_queueable)', () => {
    expect(joinQueue({ book })).toEqual({
      allowed: false,
      blockedReason: 'not_queueable',
    })
  })

  it('respeita a ordem: unavailable, overdue, queue_limit, not_queueable', () => {
    const everything: StudentCirculation = {
      activeLoanCount: 0,
      activeQueueCount: 7,
      openLoans: [{ workId: 'x', status: 'active', dueAt: YESTERDAY }],
    }
    const unavailableBook = { ...book, unavailableForNewRequests: true }

    expect(
      joinQueue({ book: unavailableBook, student: everything }).blockedReason,
    ).toBe('unavailable')
    expect(joinQueue({ book, student: everything }).blockedReason).toBe(
      'overdue',
    )
    expect(
      joinQueue({ book, student: { ...everything, openLoans: [] } })
        .blockedReason,
    ).toBe('queue_limit')
    expect(
      joinQueue({
        book,
        student: { ...everything, openLoans: [], activeQueueCount: 0 },
      }).blockedReason,
    ).toBe('not_queueable')
  })

  it('não olha o mesmo título nem o limite de empréstimos (são regras do pedido)', () => {
    expect(
      joinQueue({
        student: {
          activeLoanCount: 10,
          activeQueueCount: 0,
          openLoans: [
            { workId: bookWithoutCopies.workId, status: 'awaiting_pickup' },
          ],
        },
      }),
    ).toEqual({ allowed: true })
  })
})
