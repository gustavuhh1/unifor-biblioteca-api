import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../../../shared/errors.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { renewLoan } = await import('../services/loan-renew.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { NOW, STUDENT_UID, makeActiveLoan, makeLoan, makeStudent } =
  await import('./loan.fixtures.js')

const DUE = atLocalTime('2026-10-16', '21:55')

// Guarda o aluno, o livro (2 exemplares emprestados) e o empréstimo ativo que vence
// sexta 16/10 às 21:55. O outro exemplar vence em 20/10.
function seedActiveLoan(
  options: {
    loan?: Parameters<typeof makeActiveLoan>[0]
    book?: Parameters<typeof makeBook>[0]
    holidays?: { date: string }[]
  } = {},
) {
  h.db.put('users', STUDENT_UID, makeStudent({ activeLoanCount: 1 }))
  const book: Record<string, unknown> = {
    ...makeBook({
      id: 'book1',
      copiesTotal: 2,
      copiesAvailable: 0,
      queueLength: 0,
      nextReturnAt: DUE,
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
      status: 'on_loan',
      currentLoanId: 'loan1',
      dueAt: options.loan?.dueAt ?? DUE,
    }),
  )
  h.db.put(
    'copies',
    'copy2',
    makeCopy({
      bookId: 'book1',
      registration: 'r2',
      status: 'on_loan',
      currentLoanId: 'loan2',
      dueAt: atLocalTime('2026-10-20', '21:55'),
    }),
  )
  h.db.put('loans', 'loan1', makeActiveLoan(options.loan))
  h.db.put('holidays', '2026', {
    items: (options.holidays ?? []).map((holiday) => ({
      ...holiday,
      name: 'Feriado de teste',
      scope: 'national',
    })),
  })
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

describe('renovar empréstimo (renewLoan)', () => {
  it('soma 14 dias ao vencimento, no fechamento: sexta 16/10 vira sexta 30/10, 21h55', async () => {
    seedActiveLoan()

    const response = await renewLoan(STUDENT_UID, 'loan1')

    const newDue = atLocalTime('2026-10-30', '21:55')
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      dueAt: newDue,
      originalDueAt: DUE,
      renewalCount: 1,
      renewedAt: NOW,
      updatedAt: NOW,
    })
    expect(response).toMatchObject({
      id: 'loan1',
      status: 'active',
      dueAt: newDue.toISOString(),
      originalDueAt: DUE.toISOString(),
      renewalCount: 1,
    })
  })

  it('o aluno recebe o aviso da renovação, com o novo prazo (RF-AVI-01)', async () => {
    seedActiveLoan()

    await renewLoan(STUDENT_UID, 'loan1')

    expect(h.db.all(`users/${STUDENT_UID}/notifications`)).toEqual([
      expect.objectContaining({
        type: 'renewal_done',
        loanId: 'loan1',
        action: 'open_loan',
        body: 'Novo prazo de devolução: sex, 30/10.',
      }),
    ])
  })

  it('depois de renovar não pode renovar de novo: canRenew false e already_renewed', async () => {
    seedActiveLoan()

    const response = await renewLoan(STUDENT_UID, 'loan1')

    expect(response).toMatchObject({
      canRenew: false,
      renewalDenialReason: 'already_renewed',
    })
  })

  it('passa a data nova para o exemplar emprestado', async () => {
    seedActiveLoan()

    await renewLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('copies', 'copy1')).toMatchObject({
      dueAt: atLocalTime('2026-10-30', '21:55'),
      updatedAt: NOW,
    })
    expect(h.db.read('copies', 'copy2')).toMatchObject({
      dueAt: atLocalTime('2026-10-20', '21:55'),
    })
  })

  it('books.nextReturnAt passa a ser o menor vencimento: o do outro exemplar', async () => {
    seedActiveLoan()

    await renewLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('books', 'book1')).toMatchObject({
      nextReturnAt: atLocalTime('2026-10-20', '21:55'),
    })
  })

  it('o vencimento que cai em feriado passa para o próximo dia aberto', async () => {
    seedActiveLoan({ holidays: [{ date: '2026-10-30' }] })

    await renewLoan(STUDENT_UID, 'loan1')

    // Sexta 30/10 é feriado; sábado 31/10 abre, com o fechamento das 14h10.
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      dueAt: atLocalTime('2026-10-31', '14:10'),
    })
  })

  it('usa renewalDays e maxRenewals de settings/library', async () => {
    seedActiveLoan({ loan: { renewalCount: 1 } })
    h.db.put('settings', 'library', { renewalDays: 7, maxRenewals: 2 })

    await renewLoan(STUDENT_UID, 'loan1')

    expect(h.db.read('loans', 'loan1')).toMatchObject({
      dueAt: atLocalTime('2026-10-23', '21:55'),
      renewalCount: 2,
    })
  })

  it('invalida o cache da busca (a devolução prevista do livro mudou)', async () => {
    seedActiveLoan()
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    await renewLoan(STUDENT_UID, 'loan1')
    await getCachedActiveBooks(load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('renovação negada (renewLoan)', () => {
  // Confere o 409, o motivo no code e que nada foi gravado.
  async function expectDenied(code: string) {
    const before = h.db.read('loans', 'loan1')
    const copyBefore = h.db.read('copies', 'copy1')
    const error = await catchError(renewLoan(STUDENT_UID, 'loan1'))

    expect(error).toMatchObject({ status: 409, code })
    expect(h.db.read('loans', 'loan1')).toEqual(before)
    expect(h.db.read('copies', 'copy1')).toEqual(copyBefore)
  }

  it('overdue: o vencimento já passou', async () => {
    seedActiveLoan({ loan: { dueAt: atLocalTime('2026-10-14', '21:55') } })

    await expectDenied('overdue')
  })

  it('has_queue: há gente na fila do livro', async () => {
    seedActiveLoan({ book: { queueLength: 2 } })

    await expectDenied('has_queue')
  })

  it('already_renewed: a renovação já foi usada', async () => {
    seedActiveLoan({ loan: { renewalCount: 1 } })

    await expectDenied('already_renewed')
  })

  it('overdue vem antes de has_queue e de already_renewed', async () => {
    seedActiveLoan({
      loan: { dueAt: atLocalTime('2026-10-14', '21:55'), renewalCount: 1 },
      book: { queueLength: 2 },
    })

    await expectDenied('overdue')
  })

  it('a mensagem é em português e explica o motivo', async () => {
    seedActiveLoan({ book: { queueLength: 1 } })

    const error = await catchError(renewLoan(STUDENT_UID, 'loan1'))

    expect(error.message).toMatch(/fila/)
  })

  it('409 loan_not_active para pedido que ainda não foi retirado', async () => {
    seedActiveLoan()
    h.db.put('loans', 'loan1', makeLoan())

    const error = await catchError(renewLoan(STUDENT_UID, 'loan1'))

    expect(error).toMatchObject({ status: 409, code: 'loan_not_active' })
  })

  it('409 loan_not_active para empréstimo já devolvido', async () => {
    seedActiveLoan({ loan: { status: 'returned' } })

    const error = await catchError(renewLoan(STUDENT_UID, 'loan1'))

    expect(error).toMatchObject({ status: 409, code: 'loan_not_active' })
  })

  it('404 loan_not_found para empréstimo de outro aluno ou que não existe', async () => {
    seedActiveLoan({ loan: { studentUid: 'uid_outro' } })

    for (const id of ['loan1', 'nao-existe']) {
      expect(await catchError(renewLoan(STUDENT_UID, id))).toMatchObject({
        status: 404,
        code: 'loan_not_found',
      })
    }
  })
})
