import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../../../shared/errors.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { cancelLoan } = await import('../services/loan-cancel.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { NOW, STUDENT_UID, makeActiveLoan, makeLoan, makeStudent } =
  await import('./loan.fixtures.js')

// Guarda o aluno com 1 pedido, o livro com um exemplar reservado para ele e o outro
// disponível.
function seedPendingPickup(
  options: {
    loan?: Parameters<typeof makeLoan>[0]
    book?: Parameters<typeof makeBook>[0]
    copyStatus?: 'reserved' | 'withdrawn'
  } = {},
) {
  h.db.put('users', STUDENT_UID, makeStudent({ activeLoanCount: 1 }))
  const book: Record<string, unknown> = {
    ...makeBook({
      id: 'book1',
      copiesTotal: 2,
      copiesAvailable: 1,
      queueLength: 0,
      ...options.book,
    }),
  }
  delete book.id
  h.db.put('books', 'book1', book)
  h.db.put(
    'copies',
    'copy1',
    makeCopy({
      bookId: 'book1',
      registration: 'r1',
      status: options.copyStatus ?? 'reserved',
      currentLoanId: 'loan1',
    }),
  )
  h.db.put('copies', 'copy2', makeCopy({ bookId: 'book1', registration: 'r2' }))
  h.db.put('loans', 'loan1', makeLoan(options.loan))
}

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.then(
    () => undefined,
    (error: unknown) => error,
  )) as AppError
}

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cancelar pedido (cancelLoan)', () => {
  it('o pedido vira cancelled, com a hora do cancelamento', async () => {
    seedPendingPickup()

    const response = await cancelLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'cancelled',
      cancelledAt: NOW,
      updatedAt: NOW,
    })
    expect(response).toMatchObject({
      id: 'loan1',
      status: 'cancelled',
      state: 'cancelled',
      cancelledAt: NOW.toISOString(),
      pickupCode: null,
      qrToken: null,
      canRenew: false,
      progress: null,
    })
  })

  it('o exemplar volta para a estante e copiesAvailable do livro sobe 1', async () => {
    seedPendingPickup()

    await cancelLoan(STUDENT_UID, 'loan1')

    const copy = h.db.read('copies', 'copy1')
    expect(copy).toMatchObject({ status: 'available', updatedAt: NOW })
    expect(copy).not.toHaveProperty('currentLoanId')
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 2 })
  })

  it('activeLoanCount do aluno cai 1 e nunca fica negativo', async () => {
    seedPendingPickup()
    await cancelLoan(STUDENT_UID, 'loan1')
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 0,
    })

    seedPendingPickup()
    h.db.put('users', STUDENT_UID, makeStudent({ activeLoanCount: 0 }))
    await cancelLoan(STUDENT_UID, 'loan1')
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 0,
    })
  })

  it('o outro exemplar não é mexido', async () => {
    seedPendingPickup()

    await cancelLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('copies', 'copy2')).toMatchObject({ status: 'available' })
  })

  it('por enquanto, mesmo com fila o exemplar volta para a estante (a fila ainda não existe)', async () => {
    seedPendingPickup({ book: { queueLength: 3, copiesAvailable: 0 } })

    await cancelLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
  })

  it('não mexe no exemplar que já não está reservado (retirado do acervo)', async () => {
    seedPendingPickup({ copyStatus: 'withdrawn' })

    await cancelLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'withdrawn' })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
    expect(h.db.read('loans', 'loan1')).toMatchObject({ status: 'cancelled' })
  })

  it('invalida o cache da busca', async () => {
    seedPendingPickup()
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    await cancelLoan(STUDENT_UID, 'loan1')
    await getCachedActiveBooks(load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('cancelamento recusado (cancelLoan)', () => {
  it('404 loan_not_found para um pedido que não existe', async () => {
    seedPendingPickup()

    const error = await catchError(cancelLoan(STUDENT_UID, 'nao-existe'))

    expect(error).toMatchObject({ status: 404, code: 'loan_not_found' })
  })

  it('404 para o pedido de outro aluno, igual ao que não existe', async () => {
    seedPendingPickup({ loan: { studentUid: 'uid_outro' } })

    const error = await catchError(cancelLoan(STUDENT_UID, 'loan1'))

    expect(error).toMatchObject({ status: 404, code: 'loan_not_found' })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'awaiting_pickup',
    })
  })

  it.each(['active', 'returned', 'expired', 'cancelled'] as const)(
    '409 loan_not_cancellable para pedido %s, sem mexer em nada',
    async (status) => {
      seedPendingPickup({ loan: makeActiveLoan({ status }) })
      const before = h.db.read('loans', 'loan1')

      const error = await catchError(cancelLoan(STUDENT_UID, 'loan1'))

      expect(error).toMatchObject({ status: 409, code: 'loan_not_cancellable' })
      expect(h.db.read('loans', 'loan1')).toEqual(before)
      expect(h.db.read('users', STUDENT_UID)).toMatchObject({
        activeLoanCount: 1,
      })
      expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'reserved' })
    },
  )

  it('cancelar duas vezes: a segunda é recusada e os contadores não se repetem', async () => {
    seedPendingPickup()
    await cancelLoan(STUDENT_UID, 'loan1')

    const error = await catchError(cancelLoan(STUDENT_UID, 'loan1'))

    expect(error).toMatchObject({ status: 409, code: 'loan_not_cancellable' })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 2 })
  })
})
