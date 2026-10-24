import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { expireQueueTurns } = await import('../services/queue-turns.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { NOW, STUDENT_UID, putBook, putCopy, putEntry, putStudent } =
  await import('./queue.fixtures.js')

const DEADLINE = atLocalTime('2026-10-17', '09:12')
const AFTER_DEADLINE = new Date(DEADLINE.getTime() + 60_000)
const HOURS_24 = 24 * 60 * 60 * 1000

// A vez do Lucas em Código Limpo, vencendo em 17/10 às 09:12, com o Carlos na fila
// atrás.
beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  putStudent(h.db, STUDENT_UID, { activeQueueCount: 1 })
  putStudent(h.db, 'carlos', { activeQueueCount: 1, matricula: '2210001' })
  putBook(h.db, 'book1', { queueLength: 2 })
  putCopy(h.db, 'copy1', {
    status: 'reserved',
    reservedForQueueEntryId: 'qe1',
  })
  putEntry(h.db, 'qe1', {
    studentUid: STUDENT_UID,
    order: 1000,
    status: 'your_turn',
    reservedCopyId: 'copy1',
    turnStartedAt: NOW,
    confirmDeadline: DEADLINE,
  })
  putEntry(h.db, 'qe2', { studentUid: 'carlos', order: 2000 })
})

describe('perdeu o prazo, sai da fila (expireQueueTurns, RF-FIL-07)', () => {
  it('quem passou das 24h vira missed, com a hora em que saiu', async () => {
    const result = await expireQueueTurns(AFTER_DEADLINE)

    expect(result).toEqual({ processed: 1, entryIds: ['qe1'] })
    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'missed',
      endedAt: AFTER_DEADLINE,
    })
  })

  it('queueLength do livro e activeQueueCount do aluno caem 1 (a vaga das 7 filas volta)', async () => {
    await expireQueueTurns(AFTER_DEADLINE)

    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 1 })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 0,
    })
  })

  it('o aluno recebe o aviso de vez perdida', async () => {
    await expireQueueTurns(AFTER_DEADLINE)

    const [notice] = h.db.all(`users/${STUDENT_UID}/notifications`)
    expect(notice).toMatchObject({
      type: 'queue_turn_missed',
      title: 'Você perdeu a vez: Código Limpo',
    })
  })

  it('o exemplar passa ao próximo da fila, que ganha 24h e o aviso', async () => {
    await expireQueueTurns(AFTER_DEADLINE)

    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe2',
    })
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'your_turn',
      turnStartedAt: AFTER_DEADLINE,
      confirmDeadline: new Date(AFTER_DEADLINE.getTime() + HOURS_24),
      reservedCopyId: 'copy1',
    })
    const [notice] = h.db.all('users/carlos/notifications')
    expect(notice).toMatchObject({ type: 'queue_turn', action: 'confirm_turn' })
  })

  it('o novo prazo é contado a partir de agora: o próximo não vence na mesma rodada', async () => {
    const result = await expireQueueTurns(AFTER_DEADLINE)

    expect(result.entryIds).toEqual(['qe1'])
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'your_turn',
    })
  })

  it('sem mais ninguém na fila, o exemplar volta para a estante', async () => {
    putEntry(h.db, 'qe2', { studentUid: 'carlos', order: 2000, status: 'left' })
    putBook(h.db, 'book1', { queueLength: 1 })

    await expireQueueTurns(AFTER_DEADLINE)

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('books', 'book1')).toMatchObject({
      copiesAvailable: 1,
      queueLength: 0,
    })
  })
})

describe('quem ainda tem tempo não sai', () => {
  it('antes do prazo nada acontece', async () => {
    const result = await expireQueueTurns(new Date(DEADLINE.getTime() - 60_000))

    expect(result).toEqual({ processed: 0, entryIds: [] })
    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'your_turn',
    })
  })

  it('no instante exato do prazo ainda dá tempo', async () => {
    expect((await expireQueueTurns(DEADLINE)).processed).toBe(0)
  })

  it('quem está esperando (waiting) nunca perde o prazo, por mais antigo que seja', async () => {
    const result = await expireQueueTurns(atLocalTime('2030-01-01', '09:00'))

    expect(result.entryIds).not.toContain('qe2')
    // O qe1 perdeu a vez; o qe2 ganhou a vez agora e ainda está dentro do prazo.
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'your_turn',
    })
  })
})

describe('rodar a rotina de novo', () => {
  it('uma segunda rodada não repete nada nem desconta os contadores duas vezes', async () => {
    await expireQueueTurns(AFTER_DEADLINE)

    const second = await expireQueueTurns(AFTER_DEADLINE)

    expect(second).toEqual({ processed: 0, entryIds: [] })
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 1 })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 0,
    })
    expect(h.db.all(`users/${STUDENT_UID}/notifications`)).toHaveLength(1)
  })

  it('trata várias vezes vencidas, de livros diferentes, de uma vez', async () => {
    putBook(h.db, 'book2', { queueLength: 1 })
    putCopy(h.db, 'copy2', {
      bookId: 'book2',
      status: 'reserved',
      reservedForQueueEntryId: 'qe9',
    })
    putStudent(h.db, 'marina', { activeQueueCount: 1, matricula: '2513320' })
    putEntry(h.db, 'qe9', {
      bookId: 'book2',
      studentUid: 'marina',
      order: 1000,
      status: 'your_turn',
      reservedCopyId: 'copy2',
      confirmDeadline: DEADLINE,
    })

    const result = await expireQueueTurns(AFTER_DEADLINE)

    expect(result.processed).toBe(2)
    expect(result.entryIds.sort()).toEqual(['qe1', 'qe9'])
    expect(h.db.read('copies', 'copy2')).toMatchObject({ status: 'available' })
  })
})
