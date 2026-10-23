import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  movedDownUids,
  positionOf,
  toEndedEntryResponse,
  toLibrarianQueue,
  toMovedDownResponse,
  toPreviewEdition,
  toQueueEntryResponse,
} from '../rules/queue-view.rules.js'
import { NOW, makeEntryRecord, makeQueue } from './queue.fixtures.js'

const book = {
  id: 'book1',
  title: 'Arquitetura Limpa',
  edition: '1. ed.',
  year: 2019,
  copiesTotal: 2,
  copiesAvailable: 0,
}

describe('posição na fila (positionOf, RF-FIL-08)', () => {
  it('conta a partir de 1, pela ordem real da fila', () => {
    const queue = makeQueue()

    expect(positionOf(queue, 'qe1')).toBe(1)
    expect(positionOf(queue, 'qe4')).toBe(4)
  })

  it('devolve 0 para quem não está na fila', () => {
    expect(positionOf(makeQueue(), 'outro')).toBe(0)
  })
})

describe('lugar do aluno na resposta (toQueueEntryResponse)', () => {
  it('mostra a posição e as pessoas na frente', () => {
    expect(
      toQueueEntryResponse(makeEntryRecord('qe2', { order: 2000 }), 2),
    ).toEqual({
      id: 'qe2',
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'waiting',
      position: 2,
      peopleAhead: 1,
      joinedAt: atLocalTime('2026-10-09', '10:00').toISOString(),
      confirmDeadline: null,
      editionGroupId: null,
    })
  })

  it('na vez, mostra até quando confirmar', () => {
    const deadline = atLocalTime('2026-10-17', '09:12')

    expect(
      toQueueEntryResponse(
        makeEntryRecord('qe1', {
          status: 'your_turn',
          confirmDeadline: deadline,
          editionGroupId: 'grupo1',
        }),
        1,
      ),
    ).toMatchObject({
      status: 'your_turn',
      position: 1,
      peopleAhead: 0,
      confirmDeadline: deadline.toISOString(),
      editionGroupId: 'grupo1',
    })
  })

  it('lugar que já saiu da fila não é mostrado como fila ativa', () => {
    expect(() =>
      toQueueEntryResponse(makeEntryRecord('qe1', { status: 'left' }), 1),
    ).toThrow(/não está na fila ativa/)
  })
})

describe('lugar que saiu da fila (toEndedEntryResponse)', () => {
  it('mostra o novo status e quando saiu', () => {
    expect(
      toEndedEntryResponse(makeEntryRecord('qe1', { status: 'left' }), NOW),
    ).toEqual({
      id: 'qe1',
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'left',
      endedAt: NOW.toISOString(),
    })
  })
})

describe('prévia da fila (toPreviewEdition, RF-FIL-01)', () => {
  const edition = { ...book, copiesAvailable: 0 }

  it('mostra as pessoas na frente e que pode entrar', () => {
    expect(toPreviewEdition(edition, { allowed: true }, 4, false)).toEqual({
      bookId: 'book1',
      title: 'Arquitetura Limpa',
      edition: '1. ed.',
      year: 2019,
      copiesAvailable: 0,
      peopleAhead: 4,
      alreadyInQueue: false,
      canJoin: true,
      blockedReason: null,
    })
  })

  it('traz o motivo quando não pode entrar', () => {
    expect(
      toPreviewEdition(
        edition,
        { allowed: false, reason: 'queue_limit' },
        4,
        false,
      ),
    ).toMatchObject({
      canJoin: false,
      alreadyInQueue: false,
      blockedReason: 'queue_limit',
    })
  })

  it('quem já está na fila aparece como alreadyInQueue, sem motivo de bloqueio', () => {
    expect(
      toPreviewEdition(
        edition,
        { allowed: false, reason: 'already_in_queue' },
        4,
        true,
      ),
    ).toMatchObject({
      canJoin: false,
      alreadyInQueue: true,
      blockedReason: null,
    })
  })

  it('já na fila e bloqueado por outro motivo: mostra os dois', () => {
    expect(
      toPreviewEdition(
        edition,
        { allowed: false, reason: 'unavailable' },
        4,
        true,
      ),
    ).toMatchObject({
      canJoin: false,
      alreadyInQueue: true,
      blockedReason: 'unavailable',
    })
  })

  it('edição sem o campo edição ou ano vai como null', () => {
    const bare = { ...edition, edition: undefined, year: undefined }

    expect(toPreviewEdition(bare, { allowed: true }, 0, false)).toMatchObject({
      edition: null,
      year: null,
    })
  })
})

describe('fila do livro para o bibliotecário (toLibrarianQueue, RF-BAL-06)', () => {
  it('numera as posições na ordem real e mostra nome e matrícula', () => {
    const response = toLibrarianQueue(book, makeQueue())

    expect(response.book).toEqual({
      id: 'book1',
      title: 'Arquitetura Limpa',
      edition: '1. ed.',
      year: 2019,
      copiesTotal: 2,
      copiesAvailable: 0,
    })
    expect(
      response.items.map((item) => [item.position, item.matricula]),
    ).toEqual([
      [1, '2311001'],
      [2, '2412858'],
      [3, '2210001'],
      [4, '2513320'],
    ])
  })

  it('mostra quem pôs na fila, o motivo e os avisos', () => {
    const queue = [
      makeEntryRecord('qe1', {
        status: 'your_turn',
        origin: 'librarian',
        addReason: 'Pediu no balcão',
        confirmDeadline: atLocalTime('2026-10-17', '09:12'),
        lastNotifiedAt: NOW,
        notifyCount: 2,
      }),
    ]

    expect(toLibrarianQueue(book, queue).items[0]).toMatchObject({
      status: 'your_turn',
      origin: 'librarian',
      addReason: 'Pediu no balcão',
      confirmDeadline: atLocalTime('2026-10-17', '09:12').toISOString(),
      lastNotifiedAt: NOW.toISOString(),
      notifyCount: 2,
    })
  })
})

describe('quem desce uma posição (toMovedDownResponse, RF-BAL-07)', () => {
  it('mostra nome, matrícula e as duas posições', () => {
    expect(
      toMovedDownResponse(
        [{ entryId: 'qe2', fromPosition: 2, toPosition: 3 }],
        makeQueue(),
      ),
    ).toEqual([
      {
        entryId: 'qe2',
        studentName: 'Lucas Almeida',
        matricula: '2412858',
        fromPosition: 2,
        toPosition: 3,
      },
    ])
  })

  it('ninguém descendo devolve lista vazia', () => {
    expect(toMovedDownResponse([], makeQueue())).toEqual([])
  })
})

describe('uids de quem desce, para o auditLog (movedDownUids, RF-BAL-07)', () => {
  it('lista o uid de cada aluno que desce', () => {
    expect(
      movedDownUids(
        [
          { entryId: 'qe2', fromPosition: 2, toPosition: 3 },
          { entryId: 'qe3', fromPosition: 3, toPosition: 4 },
        ],
        makeQueue(),
      ),
    ).toEqual(['uid_lucas', 'uid_carlos'])
  })

  it('ninguém descendo devolve lista vazia', () => {
    expect(movedDownUids([], makeQueue())).toEqual([])
  })
})
