import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { applyCopyRelease, planCopyRelease } =
  await import('../services/copy-release.service.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeEntry } = await import('../../queues/__tests__/queue.fixtures.js')
const { NOW } = await import('./loan.fixtures.js')

const settings = { queueConfirmHours: 24 }
const book = makeBook({ id: 'book1', copiesAvailable: 0, queueLength: 0 })
const reserved = {
  id: 'copy1',
  ...makeCopy({ status: 'reserved', currentLoanId: 'loan1' }),
}

beforeEach(() => {
  h.db = new Fake()
  h.db.put('books', 'book1', { ...book, id: undefined })
  h.db.put('copies', 'copy1', { ...reserved, id: undefined })
})

// Roda as duas fases do "exemplar volta" numa transação, como o cancelamento.
function release(copy = reserved) {
  return h.db.runTransaction(async (tx) => {
    const plan = await planCopyRelease(tx as never, book, copy)
    applyCopyRelease(tx as never, plan, NOW, settings)
    return plan
  })
}

// Ponha na fila de book1 os alunos, na ordem dada.
function queueUp(...entries: Array<[id: string, uid: string, order: number]>) {
  for (const [id, uid, order] of entries) {
    h.db.put(
      'queueEntries',
      id,
      makeEntry({ bookId: 'book1', studentUid: uid, order }),
    )
  }
}

describe('o exemplar volta sem fila (planCopyRelease e applyCopyRelease)', () => {
  it('sem fila, o exemplar volta para a estante e o livro ganha um disponível', async () => {
    await release()

    const copy = h.db.read('copies', 'copy1')
    expect(copy).toMatchObject({ status: 'available', updatedAt: NOW })
    expect(copy).not.toHaveProperty('currentLoanId')
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
  })

  it('devolução: o exemplar emprestado também volta para a estante', async () => {
    const onLoan = {
      id: 'copy1',
      ...makeCopy({ status: 'on_loan', currentLoanId: 'loan1', dueAt: NOW }),
    }
    h.db.put('copies', 'copy1', { ...onLoan, id: undefined })

    await release(onLoan)

    const copy = h.db.read('copies', 'copy1')
    expect(copy).toMatchObject({ status: 'available' })
    expect(copy).not.toHaveProperty('dueAt')
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
  })

  it('limpa o vencimento e a reserva da fila que o exemplar tinha', async () => {
    const data = {
      ...makeCopy({ status: 'reserved' }),
      reservedForQueueEntryId: 'entry1',
      dueAt: NOW,
    }
    h.db.put('copies', 'copy1', data)

    await release({ id: 'copy1', ...data })

    const copy = h.db.read('copies', 'copy1')
    expect(copy).not.toHaveProperty('reservedForQueueEntryId')
    expect(copy).not.toHaveProperty('dueAt')
  })

  it('exemplar que não está reservado nem emprestado (retirado do acervo) não é mexido', async () => {
    const withdrawn = { ...reserved, status: 'withdrawn' as const }
    h.db.put('copies', 'copy1', { ...withdrawn, id: undefined })

    await release(withdrawn)

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'withdrawn' })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 0 })
  })
})

describe('o exemplar volta com fila (RF-FIL-06)', () => {
  it('fica guardado para o 1º da fila, de menor order, que passa a ter a vez', async () => {
    queueUp(['qe2', 'uid_carlos', 2000], ['qe1', 'uid_ana', 1000])

    const plan = await release()

    expect(plan.queueTarget?.entry.id).toBe('qe1')
    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe1',
    })
    expect(h.db.read('copies', 'copy1')).not.toHaveProperty('currentLoanId')
  })

  it('o 1º da fila ganha 24h corridas para confirmar', async () => {
    queueUp(['qe1', 'uid_ana', 1000])

    await release()

    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'your_turn',
      turnStartedAt: NOW,
      confirmDeadline: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      reservedCopyId: 'copy1',
      notifyCount: 1,
    })
  })

  it('o 2º da fila continua esperando', async () => {
    queueUp(['qe1', 'uid_ana', 1000], ['qe2', 'uid_carlos', 2000])

    await release()

    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'waiting',
    })
  })

  it('o 1º da fila recebe o aviso "É a sua vez" dentro do app', async () => {
    queueUp(['qe1', 'uid_ana', 1000])

    await release()

    const [notice] = h.db.all('users/uid_ana/notifications')
    expect(notice).toMatchObject({
      type: 'queue_turn',
      title: 'É a sua vez: Código Limpo',
      body: 'Confirme até 16/10 às 12:00 que vai retirar.',
      action: 'confirm_turn',
      queueEntryId: 'qe1',
    })
  })

  it('o exemplar não volta para a estante: copiesAvailable do livro não muda', async () => {
    queueUp(['qe1', 'uid_ana', 1000])

    await release()

    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 0 })
  })

  it('só quem está esperando (waiting) é o próximo: quem já está na vez fica de fora', async () => {
    h.db.put(
      'queueEntries',
      'qe1',
      makeEntry({
        bookId: 'book1',
        studentUid: 'uid_ana',
        order: 1000,
        status: 'your_turn',
        confirmDeadline: atLocalTime('2026-10-17', '09:00'),
      }),
    )
    queueUp(['qe2', 'uid_carlos', 2000])

    const plan = await release()

    expect(plan.queueTarget?.entry.id).toBe('qe2')
  })

  it('a fila de outra edição não conta', async () => {
    h.db.put(
      'queueEntries',
      'qe9',
      makeEntry({ bookId: 'outra', studentUid: 'uid_ana', order: 1000 }),
    )

    const plan = await release()

    expect(plan.queueTarget).toBeUndefined()
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
  })
})
