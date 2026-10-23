import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../../../shared/errors.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { requestLoan } = await import('../services/loan-request.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { NOW, STUDENT_UID, makeActiveLoan, makeLoan, makeStudent } =
  await import('./loan.fixtures.js')

const body = { bookId: 'book1' }

// Guarda o aluno, um livro com 2 exemplares disponíveis e o cache de feriados de
// 2026 (sem feriados), para o pedido não ir à rede.
function seedBasics(
  options: {
    student?: Record<string, unknown>
    book?: Parameters<typeof makeBook>[0]
    copies?: ('available' | 'reserved' | 'on_loan' | 'withdrawn')[]
  } = {},
) {
  h.db.put('users', STUDENT_UID, makeStudent(options.student))
  const book: Record<string, unknown> = {
    ...makeBook({
      id: 'book1',
      copiesTotal: 2,
      copiesAvailable: 2,
      queueLength: 0,
      ...options.book,
    }),
  }
  delete book.id
  h.db.put('books', 'book1', book)
  ;(options.copies ?? ['available', 'available']).forEach((status, index) =>
    h.db.put(
      'copies',
      `copy${index + 1}`,
      makeCopy({ bookId: 'book1', registration: `r${index + 1}`, status }),
    ),
  )
  h.db.put('holidays', '2026', { items: [] })
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

describe('solicitar empréstimo (requestLoan)', () => {
  it('cria o pedido aguardando retirada, com 2 dias úteis até o fechamento (quinta → segunda 19/10, 21h55)', async () => {
    seedBasics()

    const response = await requestLoan(STUDENT_UID, body)

    expect(response).toMatchObject({
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      bookShelf: 'Estante 005.1',
      status: 'awaiting_pickup',
      state: 'ready_for_pickup',
      canRenew: false,
      dueAt: null,
    })
    expect(response.requestedAt).toBe(NOW.toISOString())
    expect(response.pickupDeadline).toBe(
      atLocalTime('2026-10-19', '21:55').toISOString(),
    )
    expect(response.pickupCode).toMatch(/^RET-\d{4}$/)
    // 192 bits em base64url: pelo menos 128 bits, como pede RF-EMP-07.
    expect(response.qrToken).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('grava o pedido com as cópias do aluno e do livro, a origem e a retirada ainda vazia', async () => {
    seedBasics()

    const response = await requestLoan(STUDENT_UID, body)

    expect(h.db.read('loans', response.id)).toMatchObject({
      studentUid: STUDENT_UID,
      matricula: '2412858',
      studentName: 'Lucas Almeida',
      bookId: 'book1',
      workId: 'codigo-limpo--martin',
      bookTitle: 'Código Limpo',
      bookShelf: 'Estante 005.1',
      status: 'awaiting_pickup',
      origin: 'request',
      pickupCode: response.pickupCode,
      qrToken: response.qrToken,
      requestedAt: NOW,
      pickupDeadline: atLocalTime('2026-10-19', '21:55'),
      loanDays: 14,
      renewalCount: 0,
      remindersSent: {},
      createdAt: NOW,
      updatedAt: NOW,
    })
    expect(h.db.read('loans', response.id)).not.toHaveProperty('dueAt')
    expect(h.db.read('loans', response.id)).not.toHaveProperty('pickedUpAt')
  })

  it('separa o exemplar, baixa copiesAvailable do livro e sobe activeLoanCount do aluno', async () => {
    seedBasics({ student: { activeLoanCount: 3 } })

    const response = await requestLoan(STUDENT_UID, body)

    const reserved = ['copy1', 'copy2']
      .map((id) => h.db.read('copies', id))
      .filter((copy) => copy?.status === 'reserved')
    expect(reserved).toHaveLength(1)
    expect(reserved[0]).toMatchObject({ currentLoanId: response.id })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 4,
    })
  })

  it('usa a matrícula no lugar do nome quando o aluno ainda não informou o nome', async () => {
    seedBasics({ student: { fullName: undefined } })

    const response = await requestLoan(STUDENT_UID, body)

    expect(h.db.read('loans', response.id)).toMatchObject({
      studentName: '2412858',
    })
  })

  it('o código de retirada não repete o de outro pedido aguardando retirada', async () => {
    seedBasics()
    h.db.put('loans', 'outro', makeLoan({ studentUid: 'uid_outro' }))

    const response = await requestLoan(STUDENT_UID, body)

    expect(response.pickupCode).not.toBe('RET-4821')
  })

  it('pula o feriado: com segunda 19/10 feriado, o prazo vai para terça 20/10', async () => {
    seedBasics()
    h.db.put('holidays', '2026', {
      items: [
        { date: '2026-10-19', name: 'Feriado de teste', scope: 'national' },
      ],
    })

    const response = await requestLoan(STUDENT_UID, body)

    expect(response.pickupDeadline).toBe(
      atLocalTime('2026-10-20', '21:55').toISOString(),
    )
  })

  it('usa pickupBusinessDays e loanDays de settings/library', async () => {
    seedBasics()
    h.db.put('settings', 'library', { pickupBusinessDays: 3, loanDays: 21 })

    const response = await requestLoan(STUDENT_UID, body)

    expect(response.pickupDeadline).toBe(
      atLocalTime('2026-10-20', '21:55').toISOString(),
    )
    expect(h.db.read('loans', response.id)).toMatchObject({ loanDays: 21 })
  })

  it('usa a data simulada de settings/library fora de produção (RF-SIS-04)', async () => {
    seedBasics()
    const simulated = atLocalTime('2026-10-09', '10:00')
    h.db.put('settings', 'library', { simulatedNow: simulated })

    const response = await requestLoan(STUDENT_UID, body)

    expect(response.requestedAt).toBe(simulated.toISOString())
    // Sexta 09/10 + 2 dias úteis, com 12/10 sem feriado cadastrado: terça 13/10.
    expect(response.pickupDeadline).toBe(
      atLocalTime('2026-10-13', '21:55').toISOString(),
    )
  })

  it('invalida o cache da busca (o livro perdeu um exemplar disponível)', async () => {
    seedBasics()
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    await requestLoan(STUDENT_UID, body)
    await getCachedActiveBooks(load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('pedido recusado (requestLoan)', () => {
  // Confere o 409, o motivo no code e que nada foi gravado.
  async function expectRefused(code: string) {
    const error = await catchError(requestLoan(STUDENT_UID, body))

    expect(error).toMatchObject({ status: 409, code })
    expect(
      h.db.all('loans').filter((loan) => loan.status === 'awaiting_pickup'),
    ).toHaveLength(code === 'same_title' ? 1 : 0)
  }

  it('overdue: o aluno tem empréstimo atrasado (a Marina)', async () => {
    seedBasics({ student: { activeLoanCount: 3 } })
    h.db.put(
      'loans',
      'marina',
      makeActiveLoan({
        workId: 'calculo-1--stewart',
        dueAt: atLocalTime('2026-10-10', '14:10'),
      }),
    )

    await expectRefused('overdue')
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 2 })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 3,
    })
  })

  it('loan_limit: o aluno já tem 10 livros', async () => {
    seedBasics({ student: { activeLoanCount: 10 } })

    await expectRefused('loan_limit')
  })

  it('loan_limit segue maxActiveLoans de settings/library', async () => {
    seedBasics({ student: { activeLoanCount: 4 } })
    h.db.put('settings', 'library', { maxActiveLoans: 4 })

    await expectRefused('loan_limit')
  })

  it('same_title: já tem pedido ou empréstimo do mesmo título, mesmo de outra edição', async () => {
    seedBasics({ student: { activeLoanCount: 1 } })
    h.db.put('loans', 'edicao1', makeLoan({ bookId: 'outra-edicao' }))

    await expectRefused('same_title')
  })

  it('unavailable: o livro está marcado como indisponível para novos pedidos', async () => {
    seedBasics({ book: { unavailableForNewRequests: true } })

    await expectRefused('unavailable')
  })

  it('unavailable: o livro foi removido do acervo', async () => {
    seedBasics({ book: { status: 'removed' } })

    await expectRefused('unavailable')
  })

  it('no_copy_available: todos os exemplares estão reservados ou emprestados', async () => {
    seedBasics({
      book: { copiesAvailable: 0 },
      copies: ['reserved', 'on_loan'],
    })

    await expectRefused('no_copy_available')
  })

  it('no_copy_available: há fila na edição, mesmo com exemplar na estante', async () => {
    seedBasics({ book: { queueLength: 2 } })

    await expectRefused('no_copy_available')
  })

  it('overdue vem antes de loan_limit e de same_title', async () => {
    seedBasics({ student: { activeLoanCount: 10 } })
    h.db.put(
      'loans',
      'atrasado',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-10', '14:10') }),
    )

    await expectRefused('overdue')
  })

  it('unavailable vem antes de overdue', async () => {
    seedBasics({ book: { unavailableForNewRequests: true } })
    h.db.put(
      'loans',
      'atrasado',
      makeActiveLoan({
        workId: 'outro',
        dueAt: atLocalTime('2026-10-10', '14:10'),
      }),
    )

    await expectRefused('unavailable')
  })

  it('a mensagem é em português e diz o que fazer', async () => {
    seedBasics({ student: { activeLoanCount: 10 } })

    const error = await catchError(requestLoan(STUDENT_UID, body))

    expect(error.message).toMatch(/limite/)
  })

  it('não registra nada além do pedido recusado: cache e contadores ficam como estavam', async () => {
    seedBasics({ student: { activeLoanCount: 10 } })
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    await catchError(requestLoan(STUDENT_UID, body))
    await getCachedActiveBooks(load)

    expect(load).toHaveBeenCalledTimes(1)
    expect(h.db.all('loans')).toEqual([])
  })
})

describe('pedido sem livro ou sem aluno (requestLoan)', () => {
  it('404 book_not_found para um livro que não existe', async () => {
    seedBasics()

    const error = await catchError(
      requestLoan(STUDENT_UID, { bookId: 'nao-existe' }),
    )

    expect(error).toMatchObject({ status: 404, code: 'book_not_found' })
  })

  it('403 para quem não é aluno', async () => {
    seedBasics({ student: { role: 'librarian' } })

    const error = await catchError(requestLoan(STUDENT_UID, body))

    expect(error).toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('403 para conta que não está ativa', async () => {
    seedBasics({ student: { status: 'pending_email' } })

    const error = await catchError(requestLoan(STUDENT_UID, body))

    expect(error).toMatchObject({ status: 403 })
  })

  it('403 para um usuário sem documento', async () => {
    seedBasics()

    const error = await catchError(requestLoan('uid_fantasma', body))

    expect(error).toMatchObject({ status: 403 })
  })
})
