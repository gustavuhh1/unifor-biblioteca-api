import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { expirePickups } = await import('../services/loan-expire.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { putEntry } = await import('../../queues/__tests__/queue.fixtures.js')
const { NOW, STUDENT_UID, makeActiveLoan, makeLoan, makeStudent } =
  await import('./loan.fixtures.js')

// O prazo do pedido do Lucas venceu ontem (quarta 14/10, 21h55); hoje é quinta 15/10.
const EXPIRED = atLocalTime('2026-10-14', '21:55')

// Guarda o aluno com 1 pedido, o livro com o exemplar reservado para ele e o pedido.
function seedPending(
  options: {
    loan?: Parameters<typeof makeLoan>[0]
    queueLength?: number
  } = {},
) {
  h.db.put('users', STUDENT_UID, makeStudent({ activeLoanCount: 1 }))
  const book: Record<string, unknown> = {
    ...makeBook({
      id: 'book1',
      copiesTotal: 1,
      copiesAvailable: 0,
      queueLength: options.queueLength ?? 0,
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
      status: 'reserved',
      currentLoanId: 'loan1',
    }),
  )
  h.db.put(
    'loans',
    'loan1',
    makeLoan({ pickupDeadline: EXPIRED, ...options.loan }),
  )
}

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
})

describe('expirar pedido não retirado (expirePickups, RF-EMP-06)', () => {
  it('o pedido vira expirado, com a hora, e o aluno ganha uma vaga dos 10 livros', async () => {
    seedPending()

    const expired = await expirePickups(NOW)

    expect(expired).toBe(1)
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'expired',
      expiredAt: NOW,
      updatedAt: NOW,
    })
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 0,
    })
  })

  it('sem fila, o exemplar volta à estante e o livro ganha um disponível', async () => {
    seedPending()

    await expirePickups(NOW)

    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
  })

  it('com fila, o exemplar fica guardado para o 1º, que ganha a vez e o aviso', async () => {
    seedPending({ queueLength: 1 })
    h.db.put('users', 'uid_carlos', makeStudent({ matricula: '2210001' }))
    putEntry(h.db, 'qe1', { studentUid: 'uid_carlos', order: 1000 })

    await expirePickups(NOW)

    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'your_turn',
      reservedCopyId: 'copy1',
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'reserved' })
    expect(
      h.db.all('users/uid_carlos/notifications').map((notice) => notice.type),
    ).toEqual(['queue_turn'])
  })

  it('o aluno recebe o aviso de pedido expirado, que diz o prazo de 2 dias úteis', async () => {
    seedPending()

    await expirePickups(NOW)

    expect(h.db.all(`users/${STUDENT_UID}/notifications`)).toEqual([
      expect.objectContaining({
        type: 'pickup_expired',
        loanId: 'loan1',
        body: 'Seu pedido de Código Limpo expirou. Não foi retirado em 2 dias úteis e o exemplar voltou para o acervo.',
        delivery: { push: 'skipped', email: 'skipped' },
      }),
    ])
  })

  it('invalida o cache da busca, para o livro voltar a aparecer como disponível', async () => {
    seedPending()
    const before = await getCachedActiveBooks(async () => [])
    expect(before).toEqual([])

    await expirePickups(NOW)

    const reloaded = await getCachedActiveBooks(async () => [
      makeBook({ id: 'book1' }),
    ])
    expect(reloaded).toHaveLength(1)
  })
})

describe('quem não expira', () => {
  it('pedido dentro do prazo fica como está, inclusive no instante exato do prazo', async () => {
    seedPending({ loan: { pickupDeadline: NOW } })

    expect(await expirePickups(NOW)).toBe(0)
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'awaiting_pickup',
    })
    expect(h.db.all(`users/${STUDENT_UID}/notifications`)).toEqual([])
  })

  it('empréstimo ativo, devolvido ou cancelado nunca expira', async () => {
    seedPending()
    h.db.put('loans', 'loan2', makeActiveLoan({ dueAt: EXPIRED }))
    h.db.put(
      'loans',
      'loan3',
      makeLoan({ status: 'cancelled', pickupDeadline: EXPIRED }),
    )

    await expirePickups(NOW)

    expect(h.db.read('loans', 'loan2')).toMatchObject({ status: 'active' })
    expect(h.db.read('loans', 'loan3')).toMatchObject({ status: 'cancelled' })
  })
})

describe('rodar a rotina de novo', () => {
  it('uma segunda rodada não repete nada nem desconta o contador duas vezes', async () => {
    seedPending()

    await expirePickups(NOW)
    const second = await expirePickups(NOW)

    expect(second).toBe(0)
    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 0,
    })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
    expect(h.db.all(`users/${STUDENT_UID}/notifications`)).toHaveLength(1)
  })

  it('o contador do aluno nunca fica abaixo de zero', async () => {
    seedPending()
    h.db.put('users', STUDENT_UID, makeStudent({ activeLoanCount: 0 }))

    await expirePickups(NOW)

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      activeLoanCount: 0,
    })
  })

  it('trata vários pedidos vencidos de uma vez', async () => {
    seedPending()
    h.db.put('users', 'uid_marina', makeStudent({ activeLoanCount: 1 }))
    h.db.put(
      'books',
      'book2',
      Object.fromEntries(
        Object.entries(makeBook({ id: 'book2', copiesAvailable: 0 })).filter(
          ([key]) => key !== 'id',
        ),
      ),
    )
    h.db.put(
      'copies',
      'copy2',
      makeCopy({ bookId: 'book2', registration: 'r2', status: 'reserved' }),
    )
    h.db.put(
      'loans',
      'loan2',
      makeLoan({
        studentUid: 'uid_marina',
        bookId: 'book2',
        copyId: 'copy2',
        pickupDeadline: EXPIRED,
      }),
    )

    expect(await expirePickups(NOW)).toBe(2)
  })
})
