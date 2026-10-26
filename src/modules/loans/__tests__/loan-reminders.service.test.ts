import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { sendDueReminders } =
  await import('../services/loan-reminders.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeBook } = await import('../../catalog/__tests__/book.fixtures.js')
const { STUDENT_UID, makeActiveLoan, makeLoan } =
  await import('./loan.fixtures.js')

// Quinta 15/10, 8h da manhã: a hora em que a rotina roda.
const AT = atLocalTime('2026-10-15', '08:00')
const NOTICES = `users/${STUDENT_UID}/notifications`

function seedBook(overrides: Parameters<typeof makeBook>[0] = {}) {
  const book: Record<string, unknown> = {
    ...makeBook({ id: 'book1', ...overrides }),
  }
  delete book.id
  h.db.put('books', 'book1', book)
}

const noticeTypes = () =>
  h.db
    .all(NOTICES)
    .map((notice) => notice.type)
    .sort()

beforeEach(() => {
  h.db = new Fake()
  seedBook({ queueLength: 0 })
})

describe('lembretes de prazo do empréstimo (sendDueReminders, RF-SIS-05)', () => {
  it('2 dias antes: "vence em 2 dias", com o prazo e a dica de renovar', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-17', '14:10') }),
    )

    expect(await sendDueReminders(AT)).toBe(1)

    expect(h.db.all(NOTICES)).toEqual([
      expect.objectContaining({
        type: 'due_reminder',
        title: 'Código Limpo vence em 2 dias',
        body: 'Devolva até sáb, 17/10. Você ainda pode renovar uma vez.',
        action: 'open_loan',
        loanId: 'loan1',
        delivery: { push: 'skipped', email: 'skipped' },
      }),
    ])
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      remindersSent: { due2Days: AT },
    })
  })

  it('com fila no livro, avisa que não dá para renovar', async () => {
    seedBook({ queueLength: 2 })
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-17', '14:10') }),
    )

    await sendDueReminders(AT)

    expect(h.db.all(NOTICES)[0]).toMatchObject({
      body: 'Devolva até sáb, 17/10. Há 2 pessoas na fila, então não dá para renovar.',
    })
  })

  it('já renovado, diz para devolver no prazo', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({
        dueAt: atLocalTime('2026-10-17', '14:10'),
        renewalCount: 1,
      }),
    )

    await sendDueReminders(AT)

    expect(h.db.all(NOTICES)[0]).toMatchObject({
      body: 'Devolva até sáb, 17/10. Este empréstimo já foi renovado, então devolva no prazo.',
    })
  })

  it('no dia do vencimento: "vence hoje"', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-15', '21:55') }),
    )

    await sendDueReminders(AT)

    expect(h.db.all(NOTICES)[0]).toMatchObject({
      type: 'due_reminder',
      title: 'Código Limpo vence hoje',
    })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      remindersSent: { dueDay: AT },
    })
  })

  it('depois do vencimento: aviso de atraso com o valor da multa por dia útil', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-14', '21:55') }),
    )

    await sendDueReminders(AT)

    expect(h.db.all(NOTICES)).toEqual([
      expect.objectContaining({
        type: 'overdue',
        title: 'Livro atrasado: Código Limpo',
        body: 'O prazo era qua, 14/10. A multa é de R$ 2,00 por dia útil de atraso, até a devolução.',
      }),
    ])
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      remindersSent: { overdue: AT },
    })
  })

  it('mantém os lembretes que já tinham saído ao gravar o novo', async () => {
    const earlier = atLocalTime('2026-10-13', '08:00')
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({
        dueAt: atLocalTime('2026-10-15', '21:55'),
        remindersSent: { due2Days: earlier },
      }),
    )

    await sendDueReminders(AT)

    expect(h.db.read('loans', 'loan1')).toMatchObject({
      remindersSent: { due2Days: earlier, dueDay: AT },
    })
  })

  it('empréstimo que vence em 1 dia ou em mais de 2 não recebe nada', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-16', '21:55') }),
    )
    h.db.put(
      'loans',
      'loan2',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-29', '21:55') }),
    )

    expect(await sendDueReminders(AT)).toBe(0)
    expect(h.db.all(NOTICES)).toEqual([])
  })

  it('empréstimo devolvido ou pedido ainda não retirado não recebe lembrete de prazo', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({
        status: 'returned',
        dueAt: atLocalTime('2026-10-14', '21:55'),
      }),
    )
    h.db.put('loans', 'loan2', makeLoan())

    expect(await sendDueReminders(AT)).toBe(0)
  })

  it('rodar de novo no mesmo dia não repete nenhum aviso', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-14', '21:55') }),
    )
    h.db.put(
      'loans',
      'loan2',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-17', '14:10') }),
    )

    await sendDueReminders(AT)
    const second = await sendDueReminders(AT)

    expect(second).toBe(0)
    expect(noticeTypes()).toEqual(['due_reminder', 'overdue'])
  })
})

describe('último dia para retirar o pedido (sendDueReminders, RF-SIS-05)', () => {
  it('avisa no dia em que o prazo termina, com o código', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({ pickupDeadline: atLocalTime('2026-10-15', '21:55') }),
    )

    expect(await sendDueReminders(AT)).toBe(1)

    expect(h.db.all(NOTICES)).toEqual([
      expect.objectContaining({
        type: 'pickup_expiring',
        title: 'Último dia para retirar: Código Limpo',
        body: 'Retire hoje, até o fechamento da biblioteca, com o código RET-4821. Depois disso o pedido expira.',
        action: 'show_qr',
        loanId: 'loan1',
      }),
    ])
  })

  it('não avisa nos outros dias do prazo', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({ pickupDeadline: atLocalTime('2026-10-19', '21:55') }),
    )

    expect(await sendDueReminders(AT)).toBe(0)
  })

  it('rodar de novo não repete o aviso', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({ pickupDeadline: atLocalTime('2026-10-15', '21:55') }),
    )

    await sendDueReminders(AT)
    await sendDueReminders(AT)

    expect(noticeTypes()).toEqual(['pickup_expiring'])
  })

  it('pedido já retirado (ativo) não recebe o aviso de retirada', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({
        pickupDeadline: atLocalTime('2026-10-15', '21:55'),
        dueAt: atLocalTime('2026-10-29', '21:55'),
      }),
    )

    expect(await sendDueReminders(AT)).toBe(0)
  })
})
