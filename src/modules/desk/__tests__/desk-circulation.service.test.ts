import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))
vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { registerPickup } = await import('../services/loan-pickup.service.js')
const { registerReturn } = await import('../services/loan-return.service.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { makeLoan, makeActiveLoan, makeStudent } =
  await import('../../loans/__tests__/loan.fixtures.js')

const NOW = atLocalTime('2026-10-15', '12:00')

function putBase() {
  h.db.put('settings', 'library', { simulatedNow: NOW })
  h.db.put('users', 'uid_lucas', {
    ...makeStudent({ activeLoanCount: 1, booksReadByYear: {} }),
  })
  h.db.put('users', 'uid_ana', {
    ...makeStudent({
      role: 'librarian',
      matricula: '0000001',
      fullName: 'Ana Souza',
      booksReadByYear: {},
    }),
  })
  const book = makeBook({
    id: 'book1',
    copiesAvailable: 0,
    queueLength: 0,
    nextReturnAt: undefined,
  })
  const bookData = Object.fromEntries(
    Object.entries(book).filter(([field]) => field !== 'id'),
  )
  h.db.put('books', 'book1', bookData)
}

beforeEach(() => {
  h.db = new Fake()
  putBase()
})

describe('balcão: retirada', () => {
  beforeEach(() => {
    h.db.put('loans', 'loan1', makeLoan({ bookId: 'book1' }))
    h.db.put(
      'copies',
      'copy1',
      makeCopy({
        bookId: 'book1',
        status: 'reserved',
        currentLoanId: 'loan1',
      }),
    )
  })

  it('ativa empréstimo e exemplar na mesma operação', async () => {
    const response = await registerPickup('uid_ana', 'loan1')

    expect(response.loan).toMatchObject({ id: 'loan1', status: 'active' })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'active',
      pickedUpBy: 'uid_ana',
      pickedUpAt: NOW,
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'on_loan',
      currentLoanId: 'loan1',
    })
    expect(h.db.read('books', 'book1')?.nextReturnAt).toBeInstanceOf(Date)
    expect(h.db.all('auditLog')[0]).toMatchObject({ action: 'loan_pickup' })
    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'loan_picked_up',
    })
  })

  it('recusa pedido cujo prazo já acabou', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({
        bookId: 'book1',
        pickupDeadline: new Date(NOW.getTime() - 1),
      }),
    )

    await expect(registerPickup('uid_ana', 'loan1')).rejects.toMatchObject({
      code: 'pickup_expired',
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'reserved' })
  })
})

describe('balcão: devolução', () => {
  beforeEach(() => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({
        bookId: 'book1',
        dueAt: atLocalTime('2026-10-16', '21:55'),
      }),
    )
    h.db.put(
      'copies',
      'copy1',
      makeCopy({
        bookId: 'book1',
        status: 'on_loan',
        currentLoanId: 'loan1',
        dueAt: atLocalTime('2026-10-16', '21:55'),
      }),
    )
  })

  it('fecha o empréstimo, libera o exemplar e registra leitura/auditoria', async () => {
    const response = await registerReturn('uid_ana', 'loan1', false)

    expect(response).toMatchObject({
      loan: { status: 'returned' },
      fine: null,
      turnStartedFor: null,
    })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'returned',
      returnedAt: NOW,
      returnedTo: 'uid_ana',
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('users', 'uid_lucas')).toMatchObject({
      activeLoanCount: 0,
    })
    expect(h.db.all('auditLog')[0]).toMatchObject({ action: 'loan_return' })
    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'return_confirmed',
    })
  })
})
