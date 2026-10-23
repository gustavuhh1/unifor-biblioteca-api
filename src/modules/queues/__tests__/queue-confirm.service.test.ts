import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { confirmTurn } = await import('../services/queue-confirm.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeLoan } = await import('../../loans/__tests__/loan.fixtures.js')
const { NOW, STUDENT_UID, catchError, putBook, putCopy, putEntry, putStudent } =
  await import('./queue.fixtures.js')

const DEADLINE = atLocalTime('2026-10-17', '09:12')

// A vez do Lucas em Código Limpo: o exemplar copy1 está guardado para ele (qe1) e o
// Carlos espera atrás (qe2).
function seedTurn() {
  putStudent(h.db, STUDENT_UID, { activeQueueCount: 1, activeLoanCount: 0 })
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
    notifyCount: 1,
  })
  putEntry(h.db, 'qe2', {
    studentUid: 'carlos',
    matricula: '2210001',
    studentName: 'Carlos Eduardo Sá',
    order: 2000,
  })
}

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db.put('holidays', '2026', { items: [] })
  seedTurn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('confirmar a vez (confirmTurn, RF-FIL-06)', () => {
  it('cria o pedido com 2 dias úteis para retirar: confirmou na sexta 16/10, retira até terça 20/10, 21h55', async () => {
    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(loan).toMatchObject({
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'awaiting_pickup',
      state: 'ready_for_pickup',
      dueAt: null,
    })
    expect(loan.pickupCode).toMatch(/^RET-\d{4}$/)
    expect(loan.pickupDeadline).toBe(
      atLocalTime('2026-10-20', '21:55').toISOString(),
    )
  })

  it('o prazo de retirada pula o feriado: com segunda 19/10 fechada, vai até quarta 21/10', async () => {
    h.db.put('holidays', '2026', {
      items: [
        { date: '2026-10-19', name: 'Feriado de teste', scope: 'national' },
      ],
    })

    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(loan.pickupDeadline).toBe(
      atLocalTime('2026-10-21', '21:55').toISOString(),
    )
  })

  it('grava o pedido com origem queue, ligado ao lugar e ao exemplar guardado', async () => {
    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('loans', loan.id)).toMatchObject({
      studentUid: STUDENT_UID,
      matricula: '2412858',
      bookId: 'book1',
      copyId: 'copy1',
      status: 'awaiting_pickup',
      origin: 'queue',
      queueEntryId: 'qe1',
      requestedAt: NOW,
      loanDays: 14,
      renewalCount: 0,
    })
  })

  it('o lugar vira fulfilled, ligado ao pedido, e sai da fila', async () => {
    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'fulfilled',
      loanId: loan.id,
      endedAt: NOW,
    })
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 1 })
  })

  it('o exemplar fica reservado para o pedido, sem a reserva da fila', async () => {
    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    const copy = h.db.read('copies', 'copy1')
    expect(copy).toMatchObject({ status: 'reserved', currentLoanId: loan.id })
    expect(copy).not.toHaveProperty('reservedForQueueEntryId')
  })

  it('o aluno ganha um pedido e perde uma fila ativa', async () => {
    await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 1,
      activeQueueCount: 0,
    })
  })

  it('o próximo da fila continua esperando', async () => {
    await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'waiting',
    })
  })

  it('no instante exato do prazo ainda dá para confirmar', async () => {
    vi.setSystemTime(DEADLINE)

    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(loan.status).toBe('awaiting_pickup')
  })

  it('a marca "indisponível para novos pedidos" não impede a vez que já existia (RF-GAC-06)', async () => {
    putBook(h.db, 'book1', { queueLength: 2, unavailableForNewRequests: true })

    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(loan.status).toBe('awaiting_pickup')
  })

  it('multa em aberto sem atraso não impede de confirmar (RF-MUL-04)', async () => {
    putStudent(h.db, STUDENT_UID, {
      activeQueueCount: 1,
      openFineTotalCents: 1000,
    })

    const { loan } = await confirmTurn(STUDENT_UID, 'qe1')

    expect(loan.status).toBe('awaiting_pickup')
  })
})

describe('fila em várias edições: confirmar uma cancela as outras (RF-FIL-04)', () => {
  beforeEach(() => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 3 })
    putEntry(h.db, 'qe1', {
      studentUid: STUDENT_UID,
      order: 1000,
      status: 'your_turn',
      reservedCopyId: 'copy1',
      confirmDeadline: DEADLINE,
      editionGroupId: 'grupo1',
    })
    putBook(h.db, 'book2', { queueLength: 2 })
    putBook(h.db, 'book3', { queueLength: 1 })
    putEntry(h.db, 'qe5', {
      bookId: 'book2',
      studentUid: STUDENT_UID,
      order: 3000,
      editionGroupId: 'grupo1',
    })
    putEntry(h.db, 'qe6', {
      bookId: 'book3',
      studentUid: STUDENT_UID,
      order: 1000,
      editionGroupId: 'grupo1',
    })
    // Outro grupo do mesmo aluno não é tocado.
    putEntry(h.db, 'qe7', {
      bookId: 'book2',
      studentUid: STUDENT_UID,
      order: 4000,
      editionGroupId: 'outro-grupo',
    })
  })

  it('as outras edições do grupo viram cancelled_other_edition e a resposta lista quais', async () => {
    const response = await confirmTurn(STUDENT_UID, 'qe1')

    expect(response.cancelledEntryIds.sort()).toEqual(['qe5', 'qe6'])
    expect(h.db.read('queueEntries', 'qe5')).toMatchObject({
      status: 'cancelled_other_edition',
      endedAt: NOW,
    })
    expect(h.db.read('queueEntries', 'qe6')).toMatchObject({
      status: 'cancelled_other_edition',
    })
    expect(h.db.read('queueEntries', 'qe7')).toMatchObject({
      status: 'waiting',
    })
  })

  it('libera as vagas das 7 filas: 3 filas do grupo saem, sobra a de outro grupo', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 4 })

    await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeQueueCount: 1,
    })
  })

  it('cada livro cancelado perde um da fila', async () => {
    await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('books', 'book2')).toMatchObject({ queueLength: 1 })
    expect(h.db.read('books', 'book3')).toMatchObject({ queueLength: 0 })
  })

  it('o aluno é avisado de cada fila cancelada, dentro do app', async () => {
    await confirmTurn(STUDENT_UID, 'qe1')

    const notices = h.db.all(`users/${STUDENT_UID}/notifications`)
    expect(notices).toHaveLength(2)
    expect(notices[0]).toMatchObject({
      type: 'queue_cancelled_other_edition',
      title: 'Fila cancelada: Código Limpo',
    })
  })

  it('se a outra edição também estava na vez, o exemplar dela passa ao próximo', async () => {
    putCopy(h.db, 'copy2', {
      bookId: 'book2',
      status: 'reserved',
      reservedForQueueEntryId: 'qe5',
    })
    putEntry(h.db, 'qe5', {
      bookId: 'book2',
      studentUid: STUDENT_UID,
      order: 1000,
      status: 'your_turn',
      reservedCopyId: 'copy2',
      confirmDeadline: DEADLINE,
      editionGroupId: 'grupo1',
    })
    putEntry(h.db, 'qe8', {
      bookId: 'book2',
      studentUid: 'carlos',
      order: 2000,
    })

    await confirmTurn(STUDENT_UID, 'qe1')

    expect(h.db.read('copies', 'copy2')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe8',
    })
    expect(h.db.read('queueEntries', 'qe8')).toMatchObject({
      status: 'your_turn',
    })
  })
})

describe('quem não pode confirmar', () => {
  it('lugar de outro aluno devolve 404', async () => {
    expect(await catchError(confirmTurn('carlos', 'qe1'))).toMatchObject({
      status: 404,
      code: 'queue_entry_not_found',
    })
  })

  it('ainda esperando devolve 409 not_your_turn', async () => {
    expect(await catchError(confirmTurn('carlos', 'qe2'))).toMatchObject({
      status: 409,
      code: 'not_your_turn',
    })
  })

  it('passou das 24h devolve 409 turn_expired, mesmo que a rotina ainda não tenha passado', async () => {
    vi.setSystemTime(new Date(DEADLINE.getTime() + 60_000))

    const error = await catchError(confirmTurn(STUDENT_UID, 'qe1'))

    expect(error).toMatchObject({ status: 409, code: 'turn_expired' })
    expect(h.db.all('loans')).toHaveLength(0)
  })

  it('lugar que já saiu da fila devolve 409 queue_entry_not_active', async () => {
    await confirmTurn(STUDENT_UID, 'qe1')

    expect(await catchError(confirmTurn(STUDENT_UID, 'qe1'))).toMatchObject({
      status: 409,
      code: 'queue_entry_not_active',
    })
    expect(h.db.all('loans')).toHaveLength(1)
  })

  it('com empréstimo atrasado devolve 409 overdue e a vez continua valendo', async () => {
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

    const error = await catchError(confirmTurn(STUDENT_UID, 'qe1'))

    expect(error).toMatchObject({ status: 409, code: 'overdue' })
    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'your_turn',
    })
  })

  it('no limite de 10 empréstimos devolve 409 loan_limit', async () => {
    putStudent(h.db, STUDENT_UID, { activeQueueCount: 1, activeLoanCount: 10 })

    expect(await catchError(confirmTurn(STUDENT_UID, 'qe1'))).toMatchObject({
      status: 409,
      code: 'loan_limit',
    })
  })

  it('com outra edição do mesmo título em pedido devolve 409 same_title', async () => {
    h.db.put(
      'loans',
      'loan9',
      makeLoan({ bookId: 'book2', status: 'awaiting_pickup' }),
    )

    expect(await catchError(confirmTurn(STUDENT_UID, 'qe1'))).toMatchObject({
      status: 409,
      code: 'same_title',
    })
  })
})
