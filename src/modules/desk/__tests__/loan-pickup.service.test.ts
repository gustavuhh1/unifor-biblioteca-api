import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { registerPickup } = await import('../services/loan-pickup.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { NOW, makeActiveLoan } =
  await import('../../loans/__tests__/loan.fixtures.js')
const {
  LIBRARIAN_UID,
  seedActiveLoan,
  seedHolidays,
  seedLibrarian,
  seedPendingPickup,
  seedStudent,
} = await import('./desk.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  seedHolidays(h.db)
  seedLibrarian(h.db)
  seedStudent(h.db)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registrar a retirada (registerPickup, RF-BAL-02)', () => {
  it('o pedido vira ativo, com quem entregou e o vencimento em 14 dias, no fechamento', async () => {
    seedPendingPickup(h.db)

    const { loan } = await registerPickup(LIBRARIAN_UID, 'loan1')

    // Quinta 15/10 + 14 dias = quinta 29/10, às 21h55.
    const dueAt = atLocalTime('2026-10-29', '21:55')
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'active',
      pickedUpAt: NOW,
      pickedUpBy: LIBRARIAN_UID,
      dueAt,
      updatedAt: NOW,
    })
    expect(loan).toMatchObject({
      id: 'loan1',
      status: 'active',
      state: 'in_progress',
      pickupCode: null,
      pickedUpAt: NOW.toISOString(),
      dueAt: dueAt.toISOString(),
    })
  })

  it('a resposta nunca traz o qrToken', async () => {
    seedPendingPickup(h.db, { qrToken: 'segredo-do-qr-aaaaaaaaaaaa' })

    const response = await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(JSON.stringify(response)).not.toContain('segredo-do-qr')
  })

  it('o exemplar vira emprestado com o vencimento, e o livro guarda a próxima devolução', async () => {
    seedPendingPickup(h.db)

    await registerPickup(LIBRARIAN_UID, 'loan1')

    const dueAt = atLocalTime('2026-10-29', '21:55')
    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'on_loan',
      currentLoanId: 'loan1',
      dueAt,
      updatedAt: NOW,
    })
    // O outro exemplar continua na estante e o contador de disponíveis não muda
    // (o pedido já tinha separado o exemplar).
    expect(h.db.read('copies', 'copy2')).toMatchObject({ status: 'available' })
    expect(h.db.read('books', 'book1')).toMatchObject({
      nextReturnAt: dueAt,
      copiesAvailable: 1,
    })
  })

  it('a próxima devolução continua sendo a mais próxima entre os exemplares emprestados', async () => {
    seedPendingPickup(h.db)
    const earlier = atLocalTime('2026-10-20', '21:55')
    h.db.put('copies', 'copy2', {
      ...h.db.read('copies', 'copy2'),
      status: 'on_loan',
      dueAt: earlier,
    })

    await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(h.db.read('books', 'book1')).toMatchObject({ nextReturnAt: earlier })
  })

  it('o contador de livros do aluno não muda: o pedido já contava nos 10', async () => {
    seedPendingPickup(h.db)

    await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(h.db.read('users', 'uid_lucas')).toMatchObject({
      activeLoanCount: 1,
    })
  })

  it('registra loan_pickup no auditLog', async () => {
    seedPendingPickup(h.db)

    await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN_UID,
        actorRole: 'librarian',
        action: 'loan_pickup',
        targetUid: 'uid_lucas',
        bookId: 'book1',
        entityId: 'loan1',
      }),
    ])
  })

  it('o vencimento que cairia em feriado vai para o próximo dia aberto', async () => {
    // Segunda 19/10 + 14 dias = segunda 02/11, feriado: vence na terça 03/11.
    seedHolidays(h.db, ['2026-10-12', '2026-11-02'])
    vi.setSystemTime(atLocalTime('2026-10-19', '10:00'))
    seedPendingPickup(h.db)

    await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(h.db.read('loans', 'loan1')).toMatchObject({
      dueAt: atLocalTime('2026-11-03', '21:55'),
    })
  })

  it('sábado conta como dia aberto: vence no fechamento do sábado, às 14h10', async () => {
    // Sábado 24/10 + 14 dias = sábado 07/11.
    vi.setSystemTime(atLocalTime('2026-10-24', '10:00'))
    seedPendingPickup(h.db, {
      pickupDeadline: atLocalTime('2026-10-26', '21:55'),
    })

    await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(h.db.read('loans', 'loan1')).toMatchObject({
      dueAt: atLocalTime('2026-11-07', '14:10'),
    })
  })

  it('invalida o cache da busca, para mostrar a nova devolução prevista', async () => {
    seedPendingPickup(h.db)
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    await registerPickup(LIBRARIAN_UID, 'loan1')
    await getCachedActiveBooks(load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('multa em aberto sem livro atrasado não bloqueia a retirada (RF-MUL-04)', async () => {
    seedStudent(h.db, { openFineTotalCents: 800 })
    seedPendingPickup(h.db)

    const { loan } = await registerPickup(LIBRARIAN_UID, 'loan1')

    expect(loan.status).toBe('active')
  })
})

describe('retiradas recusadas', () => {
  it('pedido que não existe é 404', async () => {
    expect(
      await catchError(registerPickup(LIBRARIAN_UID, 'nada')),
    ).toMatchObject({ status: 404, code: 'loan_not_found' })
  })

  it('pedido que já foi retirado é 409, sem gravar nada de novo', async () => {
    seedActiveLoan(h.db)

    const error = await catchError(registerPickup(LIBRARIAN_UID, 'loan1'))

    expect(error).toMatchObject({
      status: 409,
      code: 'loan_not_awaiting_pickup',
      message: 'Este pedido já foi retirado.',
    })
    expect(h.db.all('auditLog')).toEqual([])
  })

  it.each(['returned', 'cancelled', 'expired'] as const)(
    'pedido %s é 409',
    async (status) => {
      seedPendingPickup(h.db, { status })

      expect(
        await catchError(registerPickup(LIBRARIAN_UID, 'loan1')),
      ).toMatchObject({ status: 409, code: 'loan_not_awaiting_pickup' })
    },
  )

  it('prazo de retirada vencido é 409 pickup_expired e o exemplar continua separado', async () => {
    seedPendingPickup(h.db)
    // O prazo era segunda 19/10 às 21h55.
    vi.setSystemTime(atLocalTime('2026-10-20', '09:00'))

    const error = await catchError(registerPickup(LIBRARIAN_UID, 'loan1'))

    expect(error).toMatchObject({ status: 409, code: 'pickup_expired' })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'awaiting_pickup',
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'reserved' })
  })

  it('aluno com livro atrasado é 409 overdue e nada muda (RF-EMP-04)', async () => {
    seedPendingPickup(h.db)
    h.db.put(
      'loans',
      'atrasado',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-10', '14:10') }),
    )

    const error = await catchError(registerPickup(LIBRARIAN_UID, 'loan1'))

    expect(error).toMatchObject({ status: 409, code: 'overdue' })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      status: 'awaiting_pickup',
    })
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'reserved' })
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('exemplar que não está separado para o pedido é erro de dados, não retirada', async () => {
    seedPendingPickup(h.db)
    h.db.put('copies', 'copy1', {
      ...h.db.read('copies', 'copy1'),
      status: 'available',
    })

    await expect(registerPickup(LIBRARIAN_UID, 'loan1')).rejects.toThrow(
      'estado inesperado',
    )
  })
})
