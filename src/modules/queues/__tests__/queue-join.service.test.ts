import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { joinQueue } = await import('../services/queue-join.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeLoan } = await import('../../loans/__tests__/loan.fixtures.js')
const {
  NOW,
  STUDENT_UID,
  catchError,
  putBook,
  putCopy,
  putEntry,
  putLibrarian,
  putStudent,
} = await import('./queue.fixtures.js')

const body = { bookIds: ['book1'] }

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db.put('holidays', '2026', { items: [] })
  putStudent(h.db, STUDENT_UID)
  putBook(h.db, 'book1')
  putCopy(h.db, 'copy1')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('entrar na fila (joinQueue, RF-FIL-02)', () => {
  it('cria o lugar no fim da fila, com a posição e as pessoas na frente', async () => {
    putEntry(h.db, 'qe1', {
      bookId: 'book1',
      studentUid: 'uid_ana',
      order: 1000,
    })
    putEntry(h.db, 'qe2', {
      bookId: 'book1',
      studentUid: 'uid_carlos',
      order: 2000,
    })
    putBook(h.db, 'book1', { queueLength: 2 })

    const { items } = await joinQueue(STUDENT_UID, body)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'waiting',
      position: 3,
      peopleAhead: 2,
      joinedAt: NOW.toISOString(),
      confirmDeadline: null,
      editionGroupId: null,
    })
    expect(h.db.read('queueEntries', items[0]!.id)).toMatchObject({
      bookId: 'book1',
      workId: 'codigo-limpo--martin',
      studentUid: STUDENT_UID,
      matricula: '2412858',
      studentName: 'Lucas Almeida',
      status: 'waiting',
      order: 3000,
      joinedAt: NOW,
      origin: 'student',
      notifyCount: 0,
    })
  })

  it('atualiza os contadores: queueLength do livro e activeQueueCount do aluno', async () => {
    putBook(h.db, 'book1', { queueLength: 2 })
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 3 })

    await joinQueue(STUDENT_UID, body)

    expect(h.db.read('books', 'book1')).toMatchObject({
      queueLength: 3,
      updatedAt: NOW,
    })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 4,
    })
  })

  it('numa fila vazia o aluno é o 1º, com order 1000', async () => {
    const { items } = await joinQueue(STUDENT_UID, body)

    expect(items[0]).toMatchObject({ position: 1, peopleAhead: 0 })
    expect(h.db.read('queueEntries', items[0]!.id)).toMatchObject({
      order: 1000,
    })
  })

  it('a ordem vem do maior order de quem ainda está na fila, não de quem já saiu', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book1', order: 1000, studentUid: 'a' })
    putEntry(h.db, 'qe2', {
      bookId: 'book1',
      order: 9000,
      status: 'left',
      studentUid: 'b',
    })

    const { items } = await joinQueue(STUDENT_UID, body)

    expect(h.db.read('queueEntries', items[0]!.id)).toMatchObject({
      order: 2000,
    })
    expect(items[0]).toMatchObject({ position: 2 })
  })

  it('a fila de outra edição não conta nas pessoas na frente', async () => {
    putBook(h.db, 'book2')
    putEntry(h.db, 'qe9', { bookId: 'book2', order: 5000, studentUid: 'a' })

    const { items } = await joinQueue(STUDENT_UID, body)

    expect(items[0]).toMatchObject({ position: 1, peopleAhead: 0 })
  })
})

describe('só com todos os exemplares emprestados (RF-FIL-02)', () => {
  it('com exemplar disponível devolve 409 not_queueable e não grava nada', async () => {
    putBook(h.db, 'book1', { copiesAvailable: 1 })

    const error = await catchError(joinQueue(STUDENT_UID, body))

    expect(error).toMatchObject({ status: 409, code: 'not_queueable' })
    expect(h.db.all('queueEntries')).toHaveLength(0)
  })

  it('livro marcado como indisponível para novos pedidos devolve 409 unavailable', async () => {
    putBook(h.db, 'book1', { unavailableForNewRequests: true })

    expect(await catchError(joinQueue(STUDENT_UID, body))).toMatchObject({
      status: 409,
      code: 'unavailable',
    })
  })

  it('livro que não existe devolve 404', async () => {
    expect(
      await catchError(joinQueue(STUDENT_UID, { bookIds: ['nao-existe'] })),
    ).toMatchObject({ status: 404, code: 'book_not_found' })
  })
})

describe('limite de 7 filas (RF-FIL-03)', () => {
  it('a 8ª fila devolve 409 queue_limit e não grava nada', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 7 })

    const error = await catchError(joinQueue(STUDENT_UID, body))

    expect(error).toMatchObject({ status: 409, code: 'queue_limit' })
    expect(h.db.all('queueEntries')).toHaveLength(0)
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 7,
    })
  })

  it('a 7ª fila ainda entra', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 6 })

    await joinQueue(STUDENT_UID, body)

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 7,
    })
  })

  it('o limite vem de settings/library', async () => {
    h.db.put('settings', 'library', { maxActiveQueues: 2 })
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 2 })

    expect(await catchError(joinQueue(STUDENT_UID, body))).toMatchObject({
      code: 'queue_limit',
    })
  })
})

describe('quem não entra na fila', () => {
  it('aluno com empréstimo atrasado devolve 409 overdue', async () => {
    h.db.put(
      'loans',
      'loan9',
      makeLoan({
        bookId: 'outro',
        workId: 'outro--autor',
        status: 'active',
        dueAt: atLocalTime('2026-10-14', '21:55'),
      }),
    )

    expect(await catchError(joinQueue(STUDENT_UID, body))).toMatchObject({
      status: 409,
      code: 'overdue',
    })
  })

  it('quem já está na fila da edição devolve 409 already_in_queue', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book1', studentUid: STUDENT_UID })

    expect(await catchError(joinQueue(STUDENT_UID, body))).toMatchObject({
      status: 409,
      code: 'already_in_queue',
    })
  })

  it('quem já saiu da fila pode entrar de novo', async () => {
    putEntry(h.db, 'qe1', {
      bookId: 'book1',
      studentUid: STUDENT_UID,
      status: 'left',
    })

    const { items } = await joinQueue(STUDENT_UID, body)

    expect(items).toHaveLength(1)
  })

  it('quem já tem pedido ou empréstimo desta edição devolve 409 same_title', async () => {
    h.db.put('loans', 'loan1', makeLoan({ bookId: 'book1', status: 'active' }))

    expect(await catchError(joinQueue(STUDENT_UID, body))).toMatchObject({
      status: 409,
      code: 'same_title',
    })
  })

  it('multa em aberto sem atraso não impede de entrar na fila (RF-MUL-04)', async () => {
    putStudent(h.db, STUDENT_UID, { openFineTotalCents: 1000 })
    h.db.put('fines', 'fine1', {
      studentUid: STUDENT_UID,
      status: 'open',
      amountCents: 1000,
    })

    const { items } = await joinQueue(STUDENT_UID, body)

    expect(items).toHaveLength(1)
  })

  it('o bibliotecário não usa esta rota (403)', async () => {
    putLibrarian(h.db, 'uid_ana')

    expect(await catchError(joinQueue('uid_ana', body))).toMatchObject({
      status: 403,
    })
  })
})

describe('fila em várias edições (RF-FIL-04)', () => {
  beforeEach(() => {
    putBook(h.db, 'book2', { edition: '2. ed.', year: 2020 })
    putCopy(h.db, 'copy2', { bookId: 'book2' })
  })

  it('cria um lugar por edição, com o mesmo editionGroupId', async () => {
    const { items } = await joinQueue(STUDENT_UID, {
      bookIds: ['book1', 'book2'],
    })

    expect(items.map((item) => item.bookId)).toEqual(['book1', 'book2'])
    expect(items[0]!.editionGroupId).toBeTruthy()
    expect(items[0]!.editionGroupId).toBe(items[1]!.editionGroupId)
  })

  it('cada edição conta como 1 das 7 filas e sobe o queueLength do seu livro', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 2 })

    await joinQueue(STUDENT_UID, { bookIds: ['book1', 'book2'] })

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 4,
    })
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 1 })
    expect(h.db.read('books', 'book2')).toMatchObject({ queueLength: 1 })
  })

  it('as edições marcadas juntas não podem passar do limite: 6 filas + 2 edições devolve queue_limit', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 6 })

    const error = await catchError(
      joinQueue(STUDENT_UID, { bookIds: ['book1', 'book2'] }),
    )

    expect(error).toMatchObject({ status: 409, code: 'queue_limit' })
    expect(h.db.all('queueEntries')).toHaveLength(0)
  })

  it('se uma edição é recusada, nenhuma é gravada', async () => {
    putBook(h.db, 'book2', { copiesAvailable: 1 })

    const error = await catchError(
      joinQueue(STUDENT_UID, { bookIds: ['book1', 'book2'] }),
    )

    expect(error).toMatchObject({ code: 'not_queueable' })
    expect(h.db.all('queueEntries')).toHaveLength(0)
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 0 })
  })

  it('edições de livros diferentes devolve 400 editions_mismatch', async () => {
    putBook(h.db, 'book3', { workId: 'outro--autor' })

    const error = await catchError(
      joinQueue(STUDENT_UID, { bookIds: ['book1', 'book3'] }),
    )

    expect(error).toMatchObject({ status: 400, code: 'editions_mismatch' })
  })

  it('já estar na fila de uma das edições recusa a entrada toda', async () => {
    putEntry(h.db, 'qe1', { bookId: 'book2', studentUid: STUDENT_UID })

    const error = await catchError(
      joinQueue(STUDENT_UID, { bookIds: ['book1', 'book2'] }),
    )

    expect(error).toMatchObject({ code: 'already_in_queue' })
  })
})
