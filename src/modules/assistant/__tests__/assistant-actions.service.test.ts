import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  requestLoan: vi.fn(),
  joinQueue: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../../loans/services/loan-request.service.js', () => ({
  requestLoan: h.requestLoan,
}))
vi.mock('../../queues/services/queue-join.service.js', () => ({
  joinQueue: h.joinQueue,
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { requestRefused } = await import('../../loans/loans.errors.js')
const { makeActiveLoan } =
  await import('../../loans/__tests__/loan.fixtures.js')
const { cancelAction, confirmAction, proposeLoan, proposeQueue } =
  await import('../services/assistant-actions.service.js')
const { ACTIONS_PATH, NOW, STUDENT_UID, putAction, putBook, seedStudent } =
  await import('./assistant.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  h.requestLoan.mockReset()
  h.joinQueue.mockReset()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedStudent(h.db)
})

describe('proposeLoan: prepara o pedido para o aluno confirmar (RF-ASS-04)', () => {
  it('grava a ação proposta com o prazo de retirada e a validade de 15 minutos', async () => {
    putBook(h.db, 'b1')

    const result = await proposeLoan(STUDENT_UID, 'b1')

    expect(result.kind).toBe('action')
    const stored = h.db.all(ACTIONS_PATH)[0]!
    expect(stored).toMatchObject({
      type: 'request_loan',
      bookIds: ['b1'],
      status: 'proposed',
      preview: { activeLoansAfter: 1 },
    })
    expect(stored.preview).toHaveProperty('pickupDeadline')
    expect((stored.expiresAt as Date).getTime() - NOW.getTime()).toBe(
      15 * 60_000,
    )
  })

  it('com livro atrasado, grava a ação bloqueada com o motivo, sem prévia', async () => {
    putBook(h.db, 'b1')
    h.db.put('users', STUDENT_UID, {
      ...h.db.read('users', STUDENT_UID),
      activeLoanCount: 1,
    })
    h.db.put(
      'loans',
      'l1',
      makeActiveLoan({ dueAt: new Date(NOW.getTime() - 86_400_000) }),
    )

    await proposeLoan(STUDENT_UID, 'b1')

    expect(h.db.all(ACTIONS_PATH)[0]).toMatchObject({
      status: 'blocked',
      blockedReason: 'overdue',
      preview: {},
    })
  })

  it('sem exemplar disponível, não grava nada e indica a fila', async () => {
    putBook(h.db, 'b1', { copiesAvailable: 0 })

    expect(await proposeLoan(STUDENT_UID, 'b1')).toEqual({ kind: 'no_copy' })
    expect(h.db.all(ACTIONS_PATH)).toEqual([])
  })

  it('livro removido ou inexistente', async () => {
    putBook(h.db, 'b1', { status: 'removed' })

    expect(await proposeLoan(STUDENT_UID, 'b1')).toEqual({
      kind: 'book_not_found',
    })
    expect(await proposeLoan(STUDENT_UID, 'nao-existe')).toEqual({
      kind: 'book_not_found',
    })
  })
})

describe('proposeQueue: prepara a entrada na fila (RF-ASS-04)', () => {
  it('grava a ação com a posição que o aluno vai ocupar', async () => {
    putBook(h.db, 'b1', { copiesAvailable: 0 })

    await proposeQueue(STUDENT_UID, ['b1'])

    expect(h.db.all(ACTIONS_PATH)[0]).toMatchObject({
      type: 'join_queue',
      status: 'proposed',
      preview: { queuePosition: 1 },
    })
  })

  it('com exemplar disponível, a fila fica bloqueada (not_queueable)', async () => {
    putBook(h.db, 'b1', { copiesAvailable: 2 })

    await proposeQueue(STUDENT_UID, ['b1'])

    expect(h.db.all(ACTIONS_PATH)[0]).toMatchObject({
      status: 'blocked',
      blockedReason: 'not_queueable',
    })
  })

  it('edições de livros diferentes não formam uma fila', async () => {
    putBook(h.db, 'b1', { copiesAvailable: 0, workId: 'w1' })
    putBook(h.db, 'b2', { copiesAvailable: 0, workId: 'w2' })

    expect(await proposeQueue(STUDENT_UID, ['b1', 'b2'])).toEqual({
      kind: 'editions_mismatch',
    })
  })
})

describe('confirmAction: executa só depois da confirmação (RF-ASS-04)', () => {
  it('pede o empréstimo pelo serviço do empréstimo, com a origem assistant', async () => {
    putBook(h.db, 'b1')
    putAction(h.db, 'a1')
    h.requestLoan.mockResolvedValue({ id: 'loan1' })

    const result = await confirmAction(STUDENT_UID, 'a1')

    expect(h.requestLoan).toHaveBeenCalledWith(
      STUDENT_UID,
      { bookId: 'b1' },
      'assistant',
    )
    expect(result.loan).toEqual({ id: 'loan1' })
    expect(result.action.status).toBe('confirmed')
    expect(h.db.read(ACTIONS_PATH, 'a1')).toMatchObject({
      status: 'confirmed',
      resultLoanId: 'loan1',
    })
  })

  it('entra na fila pelo serviço da fila, com a origem assistant', async () => {
    putAction(h.db, 'a1', { type: 'join_queue', bookIds: ['b1', 'b2'] })
    h.joinQueue.mockResolvedValue({ items: [{ id: 'q1' }, { id: 'q2' }] })

    const result = await confirmAction(STUDENT_UID, 'a1')

    expect(h.joinQueue).toHaveBeenCalledWith(
      STUDENT_UID,
      { bookIds: ['b1', 'b2'] },
      'assistant',
    )
    expect(result.queueEntries).toHaveLength(2)
    expect(h.db.read(ACTIONS_PATH, 'a1')?.resultQueueEntryIds).toEqual([
      'q1',
      'q2',
    ])
  })

  it('não executa duas vezes: a segunda confirmação responde 409', async () => {
    putAction(h.db, 'a1')
    h.requestLoan.mockResolvedValue({ id: 'loan1' })

    await confirmAction(STUDENT_UID, 'a1')
    const error = await catchError(confirmAction(STUDENT_UID, 'a1'))

    expect(error.code).toBe('assistant_action_not_pending')
    expect(h.requestLoan).toHaveBeenCalledTimes(1)
  })

  it('depois do prazo, a ação vence e nada é executado', async () => {
    putAction(h.db, 'a1', { expiresAt: new Date(NOW.getTime() - 1) })

    const error = await catchError(confirmAction(STUDENT_UID, 'a1'))

    expect(error.code).toBe('assistant_action_expired')
    expect(h.db.read(ACTIONS_PATH, 'a1')?.status).toBe('expired')
    expect(h.requestLoan).not.toHaveBeenCalled()
  })

  it('se a regra recusar agora, a ação falha com o motivo e o erro volta', async () => {
    putAction(h.db, 'a1')
    h.requestLoan.mockRejectedValue(requestRefused('loan_limit'))

    const error = await catchError(confirmAction(STUDENT_UID, 'a1'))

    expect(error.code).toBe('loan_limit')
    expect(h.db.read(ACTIONS_PATH, 'a1')).toMatchObject({
      status: 'failed',
      blockedReason: 'loan_limit',
    })
  })

  it('ação bloqueada ou de outro aluno não é executada', async () => {
    putAction(h.db, 'a1', { status: 'blocked', blockedReason: 'overdue' })

    expect((await catchError(confirmAction(STUDENT_UID, 'a1'))).code).toBe(
      'assistant_action_not_pending',
    )
    expect((await catchError(confirmAction('outro-aluno', 'a1'))).code).toBe(
      'assistant_action_not_found',
    )
  })
})

describe('cancelAction: desiste da ação (RF-ASS-04)', () => {
  it('cancela a ação que está esperando, e só uma vez', async () => {
    putAction(h.db, 'a1')

    const { action } = await cancelAction(STUDENT_UID, 'a1')

    expect(action.status).toBe('cancelled')
    expect((await catchError(cancelAction(STUDENT_UID, 'a1'))).code).toBe(
      'assistant_action_not_pending',
    )
  })
})
