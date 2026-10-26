import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))
vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { DEFAULT_OPENING_HOURS } = await import('../../../shared/library.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { makeLoan, makeActiveLoan, makeStudent } =
  await import('../../loans/__tests__/loan.fixtures.js')
const { expirePickups } = await import('../services/expire-pickups.service.js')
const { accrueFines } = await import('../services/accrue-fines.service.js')

const NOW = atLocalTime('2026-10-15', '12:00')

function putBook() {
  const book = makeBook({
    id: 'book1',
    copiesAvailable: 0,
    queueLength: 0,
  })
  h.db.put(
    'books',
    'book1',
    Object.fromEntries(
      Object.entries(book).filter(([field]) => field !== 'id'),
    ),
  )
}

beforeEach(() => {
  h.db = new Fake()
  putBook()
  h.db.put('users', 'uid_lucas', {
    ...makeStudent({ activeLoanCount: 1, booksReadByYear: {} }),
  })
})

describe('job expire_pickups', () => {
  beforeEach(() => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({
        bookId: 'book1',
        pickupDeadline: new Date(NOW.getTime() - 60_000),
      }),
    )
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

  it('expira, libera exemplar e vaga do aluno sem repetir', async () => {
    expect(await expirePickups(NOW, { queueConfirmHours: 24 })).toMatchObject({
      processed: 1,
      loanIds: ['loan1'],
    })
    expect(await expirePickups(NOW, { queueConfirmHours: 24 })).toMatchObject({
      processed: 0,
    })
    expect(h.db.read('loans', 'loan1')).toMatchObject({ status: 'expired' })
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('users', 'uid_lucas')).toMatchObject({
      activeLoanCount: 0,
    })
    expect(h.db.all('users/uid_lucas/notifications')).toHaveLength(1)
  })
})

describe('job accrue_fines', () => {
  it('cria uma multa accruing no primeiro dia útil de atraso e não duplica', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({
        bookId: 'book1',
        dueAt: atLocalTime('2026-10-14', '21:55'),
      }),
    )
    const settings = {
      maxActiveLoans: 10,
      maxActiveQueues: 7,
      loanDays: 14,
      renewalDays: 14,
      maxRenewals: 1,
      pickupBusinessDays: 2,
      dueSoonDays: 2,
      queueConfirmHours: 24,
      fineCentsPerBusinessDay: 200,
      openingHours: DEFAULT_OPENING_HOURS,
      simulatedNow: NOW,
    }

    expect(await accrueFines(NOW, settings)).toMatchObject({ processed: 1 })
    expect(await accrueFines(NOW, settings)).toMatchObject({ processed: 0 })
    expect(h.db.all('fines')).toHaveLength(1)
    expect(h.db.all('fines')[0]).toMatchObject({
      status: 'accruing',
      loanId: 'loan1',
      ratePerBusinessDayCents: 200,
    })
    expect(h.db.read('loans', 'loan1')?.fineId).toBeTruthy()
  })
})
