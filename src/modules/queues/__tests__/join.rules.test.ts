import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REQUEST_LIMITS,
  type StudentCirculation,
} from '../../../shared/rules/request-eligibility.js'
import { areSameWork, checkJoinEdition } from '../rules/join.rules.js'
import { NOW } from './queue.fixtures.js'

const book = {
  id: 'book1',
  workId: 'codigo-limpo--martin',
  status: 'active' as const,
  unavailableForNewRequests: false,
  copiesAvailable: 0,
}

const student: StudentCirculation = {
  activeLoanCount: 2,
  activeQueueCount: 1,
  openLoans: [],
}

const check = (
  overrides: Partial<Parameters<typeof checkJoinEdition>[0]> = {},
) =>
  checkJoinEdition({
    book,
    student,
    limits: DEFAULT_REQUEST_LIMITS,
    at: NOW,
    activeQueueBookIds: new Set(),
    ...overrides,
  })

describe('entrar na fila só com todos os exemplares emprestados (RF-FIL-02)', () => {
  it('libera quando não há exemplar disponível', () => {
    expect(check()).toEqual({ allowed: true })
  })

  it('com exemplar disponível devolve not_queueable', () => {
    expect(check({ book: { ...book, copiesAvailable: 1 } })).toEqual({
      allowed: false,
      reason: 'not_queueable',
    })
  })

  it('livro marcado como indisponível para novos pedidos não aceita fila', () => {
    expect(
      check({ book: { ...book, unavailableForNewRequests: true } }),
    ).toEqual({ allowed: false, reason: 'unavailable' })
  })

  it('aluno com empréstimo atrasado não entra na fila', () => {
    const late: StudentCirculation = {
      ...student,
      openLoans: [
        {
          bookId: 'outro',
          workId: 'outro--autor',
          status: 'active',
          dueAt: new Date(NOW.getTime() - 60_000),
        },
      ],
    }

    expect(check({ student: late })).toEqual({
      allowed: false,
      reason: 'overdue',
    })
  })
})

describe('limite de 7 filas (RF-FIL-03)', () => {
  it('a 8ª fila devolve queue_limit', () => {
    expect(check({ student: { ...student, activeQueueCount: 7 } })).toEqual({
      allowed: false,
      reason: 'queue_limit',
    })
  })

  it('a 7ª fila ainda passa', () => {
    expect(check({ student: { ...student, activeQueueCount: 6 } })).toEqual({
      allowed: true,
    })
  })

  it('cada edição marcada conta como 1 das 7: 5 filas + 3 edições passam do limite', () => {
    expect(
      check({
        student: { ...student, activeQueueCount: 5 },
        queueSlots: 3,
      }),
    ).toEqual({ allowed: false, reason: 'queue_limit' })
  })

  it('5 filas + 2 edições chegam a 7 e passam', () => {
    expect(
      check({
        student: { ...student, activeQueueCount: 5 },
        queueSlots: 2,
      }),
    ).toEqual({ allowed: true })
  })
})

describe('lugar na mesma edição', () => {
  it('quem já está na fila da edição devolve already_in_queue', () => {
    expect(check({ activeQueueBookIds: new Set(['book1']) })).toEqual({
      allowed: false,
      reason: 'already_in_queue',
    })
  })

  it('estar na fila de outra edição não atrapalha esta', () => {
    expect(check({ activeQueueBookIds: new Set(['book2']) })).toEqual({
      allowed: true,
    })
  })

  it('quem já tem pedido ou empréstimo desta edição devolve same_title', () => {
    const withLoan: StudentCirculation = {
      ...student,
      openLoans: [
        {
          bookId: 'book1',
          workId: 'codigo-limpo--martin',
          status: 'awaiting_pickup',
        },
      ],
    }

    expect(check({ student: withLoan })).toEqual({
      allowed: false,
      reason: 'same_title',
    })
  })
})

describe('motivo que vem primeiro', () => {
  it('queue_limit vem antes de already_in_queue', () => {
    expect(
      check({
        student: { ...student, activeQueueCount: 7 },
        activeQueueBookIds: new Set(['book1']),
      }),
    ).toEqual({ allowed: false, reason: 'queue_limit' })
  })

  it('already_in_queue vem antes de same_title', () => {
    expect(
      check({
        activeQueueBookIds: new Set(['book1']),
        student: {
          ...student,
          openLoans: [
            { bookId: 'book1', workId: book.workId, status: 'active' },
          ],
        },
      }),
    ).toEqual({ allowed: false, reason: 'already_in_queue' })
  })
})

describe('fila em várias edições (areSameWork, RF-FIL-04)', () => {
  it('aceita edições do mesmo livro', () => {
    expect(areSameWork([{ workId: 'a' }, { workId: 'a' }])).toBe(true)
  })

  it('recusa edições de livros diferentes', () => {
    expect(areSameWork([{ workId: 'a' }, { workId: 'b' }])).toBe(false)
  })

  it('uma edição sozinha serve', () => {
    expect(areSameWork([{ workId: 'a' }])).toBe(true)
  })
})
