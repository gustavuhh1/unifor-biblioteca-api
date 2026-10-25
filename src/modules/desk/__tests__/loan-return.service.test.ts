import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { registerReturn } = await import('../services/loan-return.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeFine } = await import('../../fines/__tests__/fine.fixtures.js')
const { putEntry } = await import('../../queues/__tests__/queue.fixtures.js')
const { NOW, STUDENT_UID } =
  await import('../../loans/__tests__/loan.fixtures.js')
const {
  LIBRARIAN_UID,
  seedActiveLoan,
  seedHolidays,
  seedLibrarian,
  seedPendingPickup,
  seedStudent,
} = await import('./desk.fixtures.js')

// O Código Limpo do Lucas venceu no sábado 10/10, às 14:10; hoje é quinta 15/10 e
// 12/10 é feriado: 13, 14 e 15/10 = 3 dias úteis = R$ 6,00.
const LATE_DUE = atLocalTime('2026-10-10', '14:10')

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  seedHolidays(h.db)
  seedLibrarian(h.db)
  seedStudent(h.db, { activeLoanCount: 3 })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('devolução no prazo (registerReturn, RF-BAL-04)', () => {
  it('o empréstimo vira devolvido, com a hora e quem recebeu o livro', async () => {
    seedActiveLoan(h.db)

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'returned',
      returnedAt: NOW,
      returnedTo: LIBRARIAN_UID,
      updatedAt: NOW,
    })
    expect(response).toMatchObject({
      loan: {
        id: 'loan1',
        status: 'returned',
        state: 'returned',
        returnedAt: NOW.toISOString(),
        pickupCode: null,
        progress: null,
      },
      fine: null,
      queueNotified: false,
    })
    expect(JSON.stringify(response)).not.toContain('qrToken')
  })

  it('o aluno recebe o aviso da devolução, sem aviso de multa (RF-AVI-01)', async () => {
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.all('users/uid_lucas/notifications')).toEqual([
      expect.objectContaining({
        type: 'return_confirmed',
        loanId: 'loan1',
        action: 'none',
      }),
    ])
  })

  it('sem fila, o exemplar volta à estante e o livro ganha um disponível', async () => {
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    const copy = h.db.read('copies', 'copy1')
    expect(copy).toMatchObject({ status: 'available', updatedAt: NOW })
    expect(copy).not.toHaveProperty('currentLoanId')
    expect(copy).not.toHaveProperty('dueAt')
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 2 })
  })

  it('o aluno fica com um livro a menos e um livro lido a mais no ano', async () => {
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 2,
      booksReadByYear: { '2026': 18 },
    })
  })

  it('activeLoanCount nunca fica negativo', async () => {
    seedStudent(h.db, { activeLoanCount: 0 })
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 0,
    })
  })

  it('começa a contagem de livros lidos do ano quando ela estava vazia', async () => {
    seedStudent(h.db, { booksReadByYear: {} })
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      booksReadByYear: { '2026': 1 },
    })
  })

  it('sem outro exemplar emprestado, o livro fica sem próxima devolução', async () => {
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.read('books', 'book1')).not.toHaveProperty('nextReturnAt')
  })

  it('a próxima devolução do livro passa a ser a do outro exemplar emprestado', async () => {
    seedActiveLoan(h.db)
    const other = atLocalTime('2026-10-28', '21:55')
    h.db.put('copies', 'copy2', {
      ...h.db.read('copies', 'copy2'),
      status: 'on_loan',
      dueAt: other,
    })

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.read('books', 'book1')).toMatchObject({ nextReturnAt: other })
  })

  it('registra loan_return no auditLog', async () => {
    seedActiveLoan(h.db)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN_UID,
        actorRole: 'librarian',
        action: 'loan_return',
        targetUid: STUDENT_UID,
        bookId: 'book1',
        entityId: 'loan1',
        details: {
          fineCents: 0,
          finePaidNow: false,
          queueNotified: false,
        },
      }),
    ])
  })

  it('invalida o cache da busca, para o livro voltar a aparecer como disponível', async () => {
    seedActiveLoan(h.db)
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false })
    await getCachedActiveBooks(load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('devolução com multa (RF-MUL-02, RF-BAL-08)', () => {
  it('caso da Marina: a multa nasce congelada, em aberto, com R$ 6,00 e soma no total do aluno', async () => {
    seedActiveLoan(h.db, { dueAt: LATE_DUE })

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    expect(response.fine).toMatchObject({
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
    })
    expect(h.db.all('fines')).toEqual([
      expect.objectContaining({
        loanId: 'loan1',
        studentUid: STUDENT_UID,
        status: 'open',
        amountCents: 600,
        frozenAt: NOW,
      }),
    ])
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      openFineTotalCents: 600,
      activeLoanCount: 2,
    })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      fineId: response.fine?.id,
    })
  })

  it('congela a multa que a rotina já vinha contando', async () => {
    seedActiveLoan(h.db, { dueAt: LATE_DUE, fineId: 'fine1' })
    h.db.put(
      'fines',
      'fine1',
      makeFine({ loanId: 'loan1', studentUid: STUDENT_UID }),
    )

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    expect(response.fine).toEqual({
      id: 'fine1',
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
    })
    expect(h.db.read('fines', 'fine1')).toMatchObject({
      status: 'open',
      amountCents: 600,
      frozenAt: NOW,
    })
    expect(h.db.all('fines')).toHaveLength(1)
  })

  it('a multa em aberto gera o aviso com o valor e o pagamento no balcão (RF-AVI-01)', async () => {
    seedActiveLoan(h.db, { dueAt: LATE_DUE })

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    const types = h.db
      .all('users/uid_lucas/notifications')
      .map((notice) => notice.type)
      .sort()
    expect(types).toEqual(['fine_open', 'return_confirmed'])
    expect(
      h.db
        .all('users/uid_lucas/notifications')
        .find((notice) => notice.type === 'fine_open'),
    ).toMatchObject({
      fineId: response.fine?.id,
      action: 'open_fine',
      body: 'R$ 6,00 por 3 dias úteis de atraso. O pagamento é feito no balcão da biblioteca.',
    })
  })

  it('"Multa paga agora" avisa o pagamento em vez da multa em aberto', async () => {
    seedActiveLoan(h.db, { dueAt: LATE_DUE })

    await registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: true })

    const types = h.db
      .all('users/uid_lucas/notifications')
      .map((notice) => notice.type)
      .sort()
    expect(types).toEqual(['fine_paid', 'return_confirmed'])
  })

  it('"Multa paga agora" fecha a multa como paga, com quem recebeu, sem somar no total em aberto', async () => {
    seedActiveLoan(h.db, { dueAt: LATE_DUE })

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: true,
    })

    expect(response.fine).toMatchObject({ status: 'paid', amountCents: 600 })
    expect(h.db.all('fines')).toEqual([
      expect.objectContaining({
        status: 'paid',
        amountCents: 600,
        paidAt: NOW,
        receivedBy: LIBRARIAN_UID,
        receivedByName: 'Ana Souza',
        paidAtReturn: true,
      }),
    ])
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      openFineTotalCents: 0,
    })
    expect(h.db.all('auditLog')[0]).toMatchObject({
      details: expect.objectContaining({ fineCents: 600, finePaidNow: true }),
    })
  })

  it('"Multa paga agora" sem multa a pagar é ignorada', async () => {
    seedActiveLoan(h.db)

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: true,
    })

    expect(response.fine).toBeNull()
    expect(h.db.all('fines')).toEqual([])
  })

  it('atrasado só no fim de semana não gera multa', async () => {
    // Venceu na sexta 16/10 às 21h55 e voltou no sábado 17/10.
    seedActiveLoan(h.db, { dueAt: atLocalTime('2026-10-16', '21:55') })
    vi.setSystemTime(atLocalTime('2026-10-17', '10:00'))

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    expect(response.fine).toBeNull()
    expect(h.db.all('fines')).toEqual([])
  })
})

describe('devolução de livro com fila (RF-BAL-04, RF-FIL-06)', () => {
  it('o exemplar fica guardado para o 1º da fila, que ganha a vez na hora', async () => {
    seedActiveLoan(h.db)
    putEntry(h.db, 'qe1', {
      bookId: 'book1',
      studentUid: 'uid_carlos',
      studentName: 'Carlos Sá',
      matricula: '2311111',
      order: 1000,
    })
    putEntry(h.db, 'qe2', {
      bookId: 'book1',
      studentUid: 'uid_marina',
      order: 2000,
    })

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    expect(response.queueNotified).toBe(true)
    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'your_turn',
      turnStartedAt: NOW,
      confirmDeadline: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      reservedCopyId: 'copy1',
    })
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'waiting',
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe1',
    })
    // O exemplar não volta à estante: não ganha disponível, e o empréstimo acabou.
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
    expect(h.db.read('books', 'book1')).not.toHaveProperty('nextReturnAt')
    expect(h.db.all('auditLog')[0]).toMatchObject({
      details: expect.objectContaining({ queueNotified: true }),
    })
  })
})

describe('devoluções recusadas', () => {
  it('empréstimo que não existe é 404', async () => {
    expect(
      await catchError(
        registerReturn(LIBRARIAN_UID, 'nada', { finePaidNow: false }),
      ),
    ).toMatchObject({ status: 404, code: 'loan_not_found' })
  })

  it('pedido ainda não retirado é 409 loan_not_active, sem gravar nada', async () => {
    seedPendingPickup(h.db)

    const error = await catchError(
      registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false }),
    )

    expect(error).toMatchObject({ status: 409, code: 'loan_not_active' })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'awaiting_pickup',
    })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 3,
      booksReadByYear: { '2026': 17 },
    })
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('empréstimo já devolvido não conta duas vezes', async () => {
    seedActiveLoan(h.db, { status: 'returned' })

    const error = await catchError(
      registerReturn(LIBRARIAN_UID, 'loan1', { finePaidNow: false }),
    )

    expect(error).toMatchObject({ status: 409, code: 'loan_not_active' })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      booksReadByYear: { '2026': 17 },
    })
  })
})
