import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { previewQueue } = await import('../services/queue-preview.service.js')
const { joinQueue } = await import('../services/queue-join.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { makeLoan } = await import('../../loans/__tests__/loan.fixtures.js')
const { NOW, STUDENT_UID, catchError, putBook, putEntry, putStudent } =
  await import('./queue.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db.put('holidays', '2026', { items: [] })
  putStudent(h.db, STUDENT_UID)
  putBook(h.db, 'book1', { year: 2011 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ver pessoas na frente antes de entrar (previewQueue, RF-FIL-01)', () => {
  it('conta os lugares waiting e your_turn da edição', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book1', studentUid: 'a', order: 1000 })
    putEntry(h.db, 'qe2', {
      bookId: 'book1',
      studentUid: 'b',
      order: 2000,
      status: 'your_turn',
    })
    putEntry(h.db, 'qe3', { bookId: 'book1', studentUid: 'c', order: 3000 })

    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview.editions).toHaveLength(1)
    expect(preview.editions[0]).toMatchObject({
      bookId: 'book1',
      title: 'Código Limpo',
      peopleAhead: 3,
      canJoin: true,
      blockedReason: null,
      alreadyInQueue: false,
    })
  })

  it('quem já saiu da fila não conta', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book1', studentUid: 'a', order: 1000 })
    putEntry(h.db, 'qe2', {
      bookId: 'book1',
      studentUid: 'b',
      order: 2000,
      status: 'left',
    })
    putEntry(h.db, 'qe3', {
      bookId: 'book1',
      studentUid: 'c',
      order: 3000,
      status: 'missed',
    })

    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview.editions[0]!.peopleAhead).toBe(1)
  })

  it('o número bate com a posição de quem entra depois', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book1', studentUid: 'a', order: 1000 })
    putEntry(h.db, 'qe2', { bookId: 'book1', studentUid: 'b', order: 2000 })

    const preview = await previewQueue(STUDENT_UID, 'book1')
    const { items } = await joinQueue(STUDENT_UID, { bookIds: ['book1'] })

    expect(items[0]!.peopleAhead).toBe(preview.editions[0]!.peopleAhead)
  })

  it('mostra as filas do aluno e o limite, para ele decidir quantas edições marcar', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 3 })

    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview).toMatchObject({
      bookId: 'book1',
      activeQueueCount: 3,
      maxActiveQueues: 7,
    })
  })
})

describe('edições do mesmo livro (RF-FIL-04)', () => {
  beforeEach(() => {
    putBook(h.db, 'book2', { edition: '2. ed.', year: 2020, queueLength: 1 })
    putBook(h.db, 'book3', { edition: '3. ed.', year: 2024 })
    putBook(h.db, 'outro', { workId: 'redes--tanenbaum' })
    putBook(h.db, 'removida', { year: 2000, status: 'removed' })
    putEntry(h.db, 'qe1', { bookId: 'book2', studentUid: 'a', order: 1000 })
  })

  it('traz a edição pedida primeiro e as outras da mais nova para a mais antiga', async () => {
    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview.editions.map((edition) => edition.bookId)).toEqual([
      'book1',
      'book3',
      'book2',
    ])
  })

  it('mostra as pessoas na frente de cada edição', async () => {
    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(
      Object.fromEntries(
        preview.editions.map((edition) => [
          edition.bookId,
          edition.peopleAhead,
        ]),
      ),
    ).toEqual({ book1: 0, book2: 1, book3: 0 })
  })

  it('de outro livro ou removida não aparece', async () => {
    const preview = await previewQueue(STUDENT_UID, 'book1')
    const ids = preview.editions.map((edition) => edition.bookId)

    expect(ids).not.toContain('outro')
    expect(ids).not.toContain('removida')
  })

  it('a edição com exemplar disponível não aceita fila (not_queueable) e as outras sim', async () => {
    putBook(h.db, 'book3', {
      edition: '3. ed.',
      year: 2024,
      copiesAvailable: 1,
    })

    const preview = await previewQueue(STUDENT_UID, 'book1')
    const book3 = preview.editions.find((edition) => edition.bookId === 'book3')

    expect(book3).toMatchObject({
      canJoin: false,
      blockedReason: 'not_queueable',
      copiesAvailable: 1,
    })
    expect(preview.editions.find((e) => e.bookId === 'book2')?.canJoin).toBe(
      true,
    )
  })
})

describe('quando o aluno não pode entrar', () => {
  it('com 7 filas, queue_limit', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 7 })

    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview.editions[0]).toMatchObject({
      canJoin: false,
      blockedReason: 'queue_limit',
    })
  })

  it('já na fila da edição, alreadyInQueue sem motivo de bloqueio', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book1', studentUid: STUDENT_UID })

    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview.editions[0]).toMatchObject({
      canJoin: false,
      alreadyInQueue: true,
      blockedReason: null,
      peopleAhead: 1,
    })
  })

  it('com empréstimo atrasado, overdue', async () => {
    h.db.put(
      'loans',
      'loan9',
      makeLoan({
        bookId: 'outro',
        workId: 'outro--autor',
        status: 'active',
        dueAt: new Date(NOW.getTime() - 60_000),
      }),
    )

    const preview = await previewQueue(STUDENT_UID, 'book1')

    expect(preview.editions[0]).toMatchObject({
      canJoin: false,
      blockedReason: 'overdue',
    })
  })

  it('livro que não existe ou foi removido devolve 404', async () => {
    putBook(h.db, 'removido', { status: 'removed' })

    expect(
      await catchError(previewQueue(STUDENT_UID, 'nao-existe')),
    ).toMatchObject({ status: 404, code: 'book_not_found' })
    expect(
      await catchError(previewQueue(STUDENT_UID, 'removido')),
    ).toMatchObject({ status: 404, code: 'book_not_found' })
  })
})

describe('a prévia não grava nada', () => {
  it('nenhum documento muda', async () => {
    await previewQueue(STUDENT_UID, 'book1')

    expect(h.db.all('queueEntries')).toHaveLength(0)
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 0 })
  })
})
