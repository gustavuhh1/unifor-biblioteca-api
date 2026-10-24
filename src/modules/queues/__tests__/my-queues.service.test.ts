import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listMyQueues } = await import('../services/my-queues.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { STUDENT_UID, putBook, putEntry } = await import('./queue.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  putBook(h.db, 'book1')
  putBook(h.db, 'book2', { title: 'Arquitetura Limpa' })
})

describe('minhas filas (listMyQueues, RF-FIL-08)', () => {
  it('mostra a posição pela ordem real da fila, não pela ordem de chegada ao banco', async () => {
    // Gravados fora de ordem: a posição vem do `order`.
    putEntry(h.db, 'qe3', { studentUid: 'carlos', order: 3000 })
    putEntry(h.db, 'qe1', { studentUid: 'ana', order: 1000 })
    putEntry(h.db, 'qe2', { studentUid: STUDENT_UID, order: 2000 })

    const { items } = await listMyQueues(STUDENT_UID)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'qe2',
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'waiting',
      position: 2,
      peopleAhead: 1,
    })
  })

  it('um lugar do bibliotecário no meio da fila (order intermediário) conta na posição', async () => {
    putEntry(h.db, 'qe1', { studentUid: 'ana', order: 1000 })
    putEntry(h.db, 'qe2', { studentUid: 'carlos', order: 2000 })
    putEntry(h.db, 'qe3', { studentUid: STUDENT_UID, order: 1500 })

    const { items } = await listMyQueues(STUDENT_UID)

    expect(items[0]).toMatchObject({ id: 'qe3', position: 2 })
  })

  it('na vez, mostra o prazo para confirmar', async () => {
    const deadline = atLocalTime('2026-10-17', '09:12')
    putEntry(h.db, 'qe1', {
      studentUid: STUDENT_UID,
      order: 1000,
      status: 'your_turn',
      confirmDeadline: deadline,
    })

    const { items } = await listMyQueues(STUDENT_UID)

    expect(items[0]).toMatchObject({
      status: 'your_turn',
      position: 1,
      peopleAhead: 0,
      confirmDeadline: deadline.toISOString(),
    })
  })

  it('traz uma entrada por fila, as mais antigas primeiro, e conta as filas ativas', async () => {
    putEntry(h.db, 'qe1', {
      studentUid: STUDENT_UID,
      bookId: 'book2',
      bookTitle: 'Arquitetura Limpa',
      joinedAt: atLocalTime('2026-10-12', '10:00'),
    })
    putEntry(h.db, 'qe2', {
      studentUid: STUDENT_UID,
      joinedAt: atLocalTime('2026-10-08', '10:00'),
    })

    const result = await listMyQueues(STUDENT_UID)

    expect(result.items.map((item) => item.id)).toEqual(['qe2', 'qe1'])
    expect(result).toMatchObject({ activeQueueCount: 2, maxActiveQueues: 7 })
  })

  it('não mostra o que já saiu da fila nem a fila de outros alunos', async () => {
    putEntry(h.db, 'qe1', { studentUid: STUDENT_UID, status: 'left' })
    putEntry(h.db, 'qe2', { studentUid: STUDENT_UID, status: 'missed' })
    putEntry(h.db, 'qe3', { studentUid: STUDENT_UID, status: 'fulfilled' })
    putEntry(h.db, 'qe4', { studentUid: 'outro', order: 500 })

    const result = await listMyQueues(STUDENT_UID)

    expect(result.items).toEqual([])
    expect(result.activeQueueCount).toBe(0)
  })

  it('sem nenhuma fila devolve a lista vazia', async () => {
    expect(await listMyQueues(STUDENT_UID)).toEqual({
      items: [],
      activeQueueCount: 0,
      maxActiveQueues: 7,
    })
  })
})
