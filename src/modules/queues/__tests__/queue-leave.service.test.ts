import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { leaveQueue } = await import('../services/queue-leave.service.js')
const { listMyQueues } = await import('../services/my-queues.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { NOW, STUDENT_UID, catchError, putBook, putCopy, putEntry, putStudent } =
  await import('./queue.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  putStudent(h.db, STUDENT_UID, { activeQueueCount: 2 })
  putBook(h.db, 'book1', { queueLength: 3 })
  putCopy(h.db, 'copy1')
  putEntry(h.db, 'qe1', { studentUid: 'ana', order: 1000 })
  putEntry(h.db, 'qe2', { studentUid: STUDENT_UID, order: 2000 })
  putEntry(h.db, 'qe3', { studentUid: 'carlos', order: 3000 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sair da fila (leaveQueue, RF-FIL-05)', () => {
  it('o lugar vira left, com a hora em que saiu', async () => {
    const response = await leaveQueue(STUDENT_UID, 'qe2')

    expect(response).toEqual({
      id: 'qe2',
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'left',
      endedAt: NOW.toISOString(),
    })
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'left',
      endedAt: NOW,
      updatedAt: NOW,
    })
  })

  it('queueLength do livro e activeQueueCount do aluno caem 1 (a vaga das 7 filas volta)', async () => {
    await leaveQueue(STUDENT_UID, 'qe2')

    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 2 })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 1,
    })
  })

  it('a posição de quem estava atrás sobe', async () => {
    await leaveQueue(STUDENT_UID, 'qe2')

    const { items } = await listMyQueues('carlos')

    expect(items[0]).toMatchObject({ id: 'qe3', position: 2 })
  })

  it('quem estava atrás recebe o aviso de que subiu, com a posição nova; quem estava à frente não (RF-AVI-01)', async () => {
    await leaveQueue(STUDENT_UID, 'qe2')

    const noticesOf = (uid: string) =>
      h.db.all(`users/${uid}/notifications`).map((notice) => notice.type)
    expect(h.db.all('users/carlos/notifications')).toEqual([
      expect.objectContaining({
        type: 'queue_moved_up',
        queueEntryId: 'qe3',
        body: 'Agora você é o 2º da fila.',
      }),
    ])
    expect(noticesOf('ana')).toEqual([])
    expect(noticesOf(STUDENT_UID)).toEqual([])
  })

  it('o contador do aluno nunca fica abaixo de zero', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 0 })

    await leaveQueue(STUDENT_UID, 'qe2')

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 0,
    })
  })

  it('sair de uma fila que o exemplar ainda não voltou não mexe no exemplar', async () => {
    await leaveQueue(STUDENT_UID, 'qe2')

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'on_loan' })
  })
})

describe('sair estando na vez', () => {
  beforeEach(() => {
    putCopy(h.db, 'copy1', {
      status: 'reserved',
      reservedForQueueEntryId: 'qe2',
    })
    putEntry(h.db, 'qe2', {
      studentUid: STUDENT_UID,
      order: 2000,
      status: 'your_turn',
      reservedCopyId: 'copy1',
      turnStartedAt: NOW,
      confirmDeadline: atLocalTime('2026-10-17', '09:12'),
    })
    // Os dois da frente já saíram: o aluno é o 1º.
    putEntry(h.db, 'qe1', { studentUid: 'ana', order: 1000, status: 'left' })
  })

  it('o exemplar guardado passa ao próximo da fila, que ganha a vez e o aviso', async () => {
    await leaveQueue(STUDENT_UID, 'qe2')

    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe3',
    })
    expect(h.db.read('queueEntries', 'qe3')).toMatchObject({
      status: 'your_turn',
      reservedCopyId: 'copy1',
      confirmDeadline: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    })
    expect(h.db.all('users/carlos/notifications')).toHaveLength(1)
  })

  it('sem mais ninguém na fila, o exemplar volta para a estante', async () => {
    h.db.put('queueEntries', 'qe3', {
      ...h.db.read('queueEntries', 'qe3'),
      status: 'left',
    })
    putBook(h.db, 'book1', { queueLength: 1 })

    await leaveQueue(STUDENT_UID, 'qe2')

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('books', 'book1')).toMatchObject({
      copiesAvailable: 1,
      queueLength: 0,
    })
  })
})

describe('quem não pode sair', () => {
  it('lugar de outro aluno devolve 404, igual a lugar que não existe', async () => {
    expect(await catchError(leaveQueue(STUDENT_UID, 'qe1'))).toMatchObject({
      status: 404,
      code: 'queue_entry_not_found',
    })
    expect(
      await catchError(leaveQueue(STUDENT_UID, 'nao-existe')),
    ).toMatchObject({ status: 404, code: 'queue_entry_not_found' })
    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'waiting',
    })
  })

  it('lugar que já saiu da fila devolve 409', async () => {
    await leaveQueue(STUDENT_UID, 'qe2')

    expect(await catchError(leaveQueue(STUDENT_UID, 'qe2'))).toMatchObject({
      status: 409,
      code: 'queue_entry_not_active',
    })
    // Os contadores não são descontados duas vezes.
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 1,
    })
  })
})
