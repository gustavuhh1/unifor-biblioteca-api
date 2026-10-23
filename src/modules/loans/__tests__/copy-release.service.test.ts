import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { applyCopyRelease, findQueueHandoffTarget, planCopyRelease } =
  await import('../services/copy-release.service.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { NOW } = await import('./loan.fixtures.js')

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
    applyCopyRelease(tx as never, plan, NOW)
    return plan
  })
}

describe('o exemplar volta (planCopyRelease e applyCopyRelease)', () => {
  it('sem fila, o exemplar volta para a estante e o livro ganha um disponível', async () => {
    await release()

    const copy = h.db.read('copies', 'copy1')
    expect(copy).toMatchObject({ status: 'available', updatedAt: NOW })
    expect(copy).not.toHaveProperty('currentLoanId')
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

  it('exemplar que não está reservado (retirado do acervo) não é mexido', async () => {
    const withdrawn = { ...reserved, status: 'withdrawn' as const }
    h.db.put('copies', 'copy1', { ...withdrawn, id: undefined })

    await release(withdrawn)

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'withdrawn' })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 0 })
  })

  it('PONTO DE EXTENSÃO: a fila ainda não existe, então nunca há 1º da fila', async () => {
    const plan = await release()

    expect(plan.queueTarget).toBeUndefined()
    await h.db.runTransaction((tx) =>
      findQueueHandoffTarget(tx as never, { id: 'book1', queueLength: 5 }).then(
        (target) => expect(target).toBeUndefined(),
      ),
    )
  })

  it('se a fila entregar um 1º lugar sem o módulo da fila pronto, falha em vez de perder o exemplar', async () => {
    await expect(
      h.db.runTransaction((tx) => {
        applyCopyRelease(
          tx as never,
          { book, copy: reserved, queueTarget: { entryId: 'entry1' } },
          NOW,
        )
        return Promise.resolve()
      }),
    ).rejects.toThrow(/fila/)
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'reserved' })
  })
})
