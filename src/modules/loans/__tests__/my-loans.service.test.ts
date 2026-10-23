import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listMyLoans } = await import('../services/my-loans.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeBook } = await import('../../catalog/__tests__/book.fixtures.js')
const { NOW, STUDENT_UID, makeActiveLoan, makeLoan } =
  await import('./loan.fixtures.js')

// Guarda um livro com a fila indicada.
function seedBook(id: string, queueLength = 0) {
  const book: Record<string, unknown> = {
    ...makeBook({ id, queueLength, copiesAvailable: 0 }),
  }
  delete book.id
  h.db.put('books', id, book)
}

// A linha do tempo do Lucas e da Marina no dia de exemplo (quinta 15/10).
function seedTimeline() {
  seedBook('book_codigo_limpo')
  seedBook('book_engenharia')
  seedBook('book_redes')
  seedBook('book_calculo', 1)
  // Pedido de hoje, para retirar até segunda 19/10.
  h.db.put(
    'loans',
    'loan_pedido',
    makeLoan({ bookId: 'book_codigo_limpo', requestedAt: NOW }),
  )
  // Vence amanhã (16/10): Vence em breve.
  h.db.put(
    'loans',
    'loan_engenharia',
    makeActiveLoan({
      bookId: 'book_engenharia',
      bookTitle: 'Engenharia de Software',
      requestedAt: atLocalTime('2026-10-01', '09:00'),
    }),
  )
  // Vence 20/10: Em andamento.
  h.db.put(
    'loans',
    'loan_redes',
    makeActiveLoan({
      bookId: 'book_redes',
      bookTitle: 'Redes de Computadores',
      workId: 'redes',
      requestedAt: atLocalTime('2026-10-02', '09:00'),
      pickedUpAt: atLocalTime('2026-10-06', '21:55'),
      dueAt: atLocalTime('2026-10-20', '21:55'),
    }),
  )
  // Venceu sábado 10/10: Atrasado, e o livro tem fila.
  h.db.put(
    'loans',
    'loan_atrasado',
    makeActiveLoan({
      bookId: 'book_calculo',
      bookTitle: 'Cálculo, Vol. 1',
      workId: 'calculo',
      requestedAt: atLocalTime('2026-09-25', '09:00'),
      pickedUpAt: atLocalTime('2026-09-26', '14:10'),
      dueAt: atLocalTime('2026-10-10', '14:10'),
    }),
  )
  // Histórico.
  h.db.put(
    'loans',
    'loan_devolvido',
    makeLoan({
      status: 'returned',
      workId: 'devolvido',
      requestedAt: atLocalTime('2026-08-01', '09:00'),
      returnedAt: atLocalTime('2026-08-10', '10:00'),
    }),
  )
  h.db.put(
    'loans',
    'loan_expirado',
    makeLoan({
      status: 'expired',
      workId: 'expirado',
      requestedAt: atLocalTime('2026-09-01', '09:00'),
      expiredAt: atLocalTime('2026-09-04', '21:55'),
    }),
  )
  h.db.put(
    'loans',
    'loan_cancelado',
    makeLoan({
      status: 'cancelled',
      workId: 'cancelado',
      requestedAt: atLocalTime('2026-09-10', '09:00'),
      cancelledAt: atLocalTime('2026-09-10', '09:30'),
    }),
  )
  // Pedido de outro aluno: nunca aparece.
  h.db.put(
    'loans',
    'loan_outro',
    makeLoan({ studentUid: 'uid_outro', requestedAt: NOW }),
  )
}

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Meus empréstimos, aba ativos (listMyLoans)', () => {
  it('traz os pedidos para retirar e os empréstimos ativos, dos mais novos aos mais antigos', async () => {
    seedTimeline()

    const { view, items } = await listMyLoans(STUDENT_UID, 'active')

    expect(view).toBe('active')
    expect(items.map((item) => item.id)).toEqual([
      'loan_pedido',
      'loan_redes',
      'loan_engenharia',
      'loan_atrasado',
    ])
  })

  it('calcula o estado de cada item: Pronto para retirar, Em andamento, Vence em breve e Atrasado', async () => {
    seedTimeline()

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    const state = Object.fromEntries(items.map((item) => [item.id, item.state]))
    expect(state).toEqual({
      loan_pedido: 'ready_for_pickup',
      loan_redes: 'in_progress',
      loan_engenharia: 'due_soon',
      loan_atrasado: 'overdue',
    })
  })

  it('o pedido para retirar traz o código e o QR; o empréstimo ativo, não', async () => {
    seedTimeline()

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    const byId = Object.fromEntries(items.map((item) => [item.id, item]))
    expect(byId.loan_pedido).toMatchObject({
      pickupCode: 'RET-4821',
      qrToken: 'qr-token-de-teste-aaaaaaaaaaaaaaaaaaa',
    })
    expect(byId.loan_redes).toMatchObject({ pickupCode: null, qrToken: null })
  })

  it('o progresso vai de 0 a 1 e o do atrasado é 1', async () => {
    seedTimeline()

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    for (const item of items) {
      expect(item.progress).toBeGreaterThanOrEqual(0)
      expect(item.progress).toBeLessThanOrEqual(1)
    }
    expect(items.find((item) => item.id === 'loan_atrasado')?.progress).toBe(1)
  })

  it('diz se pode renovar: pode no que vence em breve; atrasado e livro com fila não', async () => {
    seedTimeline()

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    const byId = Object.fromEntries(items.map((item) => [item.id, item]))
    expect(byId.loan_engenharia).toMatchObject({
      canRenew: true,
      renewalDenialReason: null,
    })
    expect(byId.loan_redes).toMatchObject({ canRenew: true })
    // O Cálculo está atrasado e tem fila: vale o primeiro motivo (overdue).
    expect(byId.loan_atrasado).toMatchObject({
      canRenew: false,
      renewalDenialReason: 'overdue',
    })
    expect(byId.loan_pedido).toMatchObject({
      canRenew: false,
      renewalDenialReason: null,
    })
  })

  it('mostra has_queue e already_renewed quando são o motivo', async () => {
    seedTimeline()
    seedBook('book_redes', 2)
    h.db.put(
      'loans',
      'loan_engenharia',
      makeActiveLoan({
        bookId: 'book_engenharia',
        requestedAt: atLocalTime('2026-10-01', '09:00'),
        renewalCount: 1,
      }),
    )

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    const byId = Object.fromEntries(items.map((item) => [item.id, item]))
    expect(byId.loan_redes).toMatchObject({
      canRenew: false,
      renewalDenialReason: 'has_queue',
    })
    expect(byId.loan_engenharia).toMatchObject({
      canRenew: false,
      renewalDenialReason: 'already_renewed',
    })
  })

  it('aluno sem nada em andamento recebe a lista vazia', async () => {
    const result = await listMyLoans(STUDENT_UID, 'active')

    expect(result).toEqual({ view: 'active', items: [] })
  })

  it('usa dueSoonDays de settings/library', async () => {
    seedTimeline()
    h.db.put('settings', 'library', { dueSoonDays: 6 })

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    expect(items.find((item) => item.id === 'loan_redes')?.state).toBe(
      'due_soon',
    )
  })

  it('usa a data simulada de settings/library (RF-SIS-04)', async () => {
    seedTimeline()
    h.db.put('settings', 'library', {
      simulatedNow: atLocalTime('2026-10-17', '10:00'),
    })

    const { items } = await listMyLoans(STUDENT_UID, 'active')

    // No sábado 17/10 o Engenharia (vencia 16/10) já está atrasado.
    expect(items.find((item) => item.id === 'loan_engenharia')?.state).toBe(
      'overdue',
    )
  })
})

describe('Meus empréstimos, aba histórico (listMyLoans)', () => {
  it('traz devolvidos, expirados e cancelados, dos mais novos aos mais antigos', async () => {
    seedTimeline()

    const { view, items } = await listMyLoans(STUDENT_UID, 'history')

    expect(view).toBe('history')
    expect(items.map((item) => [item.id, item.state])).toEqual([
      ['loan_cancelado', 'cancelled'],
      ['loan_expirado', 'expired'],
      ['loan_devolvido', 'returned'],
    ])
  })

  it('os itens do histórico não têm progresso, código, QR nem renovação', async () => {
    seedTimeline()

    const { items } = await listMyLoans(STUDENT_UID, 'history')

    for (const item of items) {
      expect(item).toMatchObject({
        progress: null,
        pickupCode: null,
        qrToken: null,
        canRenew: false,
        renewalDenialReason: null,
      })
    }
  })

  it('nunca traz o pedido de outro aluno', async () => {
    seedTimeline()

    for (const view of ['active', 'history'] as const) {
      const { items } = await listMyLoans(STUDENT_UID, view)
      expect(items.map((item) => item.id)).not.toContain('loan_outro')
    }
  })
})
