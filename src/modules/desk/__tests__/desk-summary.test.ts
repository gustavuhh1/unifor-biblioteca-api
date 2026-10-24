import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { getDeskSummary } = await import('../services/desk-summary.service.js')
const { dayRangeOf } = await import('../rules/summary.rules.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeFine } = await import('../../fines/__tests__/fine.fixtures.js')
const { putEntry } = await import('../../queues/__tests__/queue.fixtures.js')
const { NOW, makeActiveLoan, makeLoan } =
  await import('../../loans/__tests__/loan.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('o dia em Fortaleza (dayRangeOf)', () => {
  it('vai da meia-noite de Fortaleza até a meia-noite seguinte', () => {
    expect(dayRangeOf(NOW)).toEqual({
      from: atLocalTime('2026-10-15', '00:00'),
      to: atLocalTime('2026-10-16', '00:00'),
    })
  })

  it('23h59 ainda é o mesmo dia; 00h00 já é o seguinte', () => {
    expect(dayRangeOf(atLocalTime('2026-10-15', '23:59')).from).toEqual(
      atLocalTime('2026-10-15', '00:00'),
    )
    expect(dayRangeOf(atLocalTime('2026-10-16', '00:00')).from).toEqual(
      atLocalTime('2026-10-16', '00:00'),
    )
  })

  it('usa o dia de Fortaleza, e não o de UTC: 22h de 15/10 já é 16/10 em UTC', () => {
    const at = atLocalTime('2026-10-15', '22:00')

    expect(dayRangeOf(at).from).toEqual(atLocalTime('2026-10-15', '00:00'))
  })
})

describe('Painel do balcão (getDeskSummary, RF-BAL-01)', () => {
  it('sem movimento, tudo zero', async () => {
    expect(await getDeskSummary()).toEqual({
      pendingPickups: 0,
      returnsToday: 0,
      queueAwaitingConfirm: 0,
      openFines: 0,
    })
  })

  it('conta pedidos aguardando retirada, e só eles', async () => {
    h.db.put('loans', 'a', makeLoan())
    h.db.put('loans', 'b', makeLoan({ pickupCode: 'RET-0002' }))
    h.db.put('loans', 'c', makeActiveLoan())
    h.db.put('loans', 'd', makeLoan({ status: 'cancelled' }))

    expect((await getDeskSummary()).pendingPickups).toBe(2)
  })

  it('conta só as devoluções de hoje, de meia-noite a meia-noite de Fortaleza', async () => {
    const returned = (returnedAt: Date) =>
      makeActiveLoan({ status: 'returned', returnedAt })
    h.db.put('loans', 'ontem', returned(atLocalTime('2026-10-14', '23:59')))
    h.db.put('loans', 'zero', returned(atLocalTime('2026-10-15', '00:00')))
    h.db.put('loans', 'manha', returned(atLocalTime('2026-10-15', '08:30')))
    h.db.put('loans', 'noite', returned(atLocalTime('2026-10-15', '23:59')))
    h.db.put('loans', 'amanha', returned(atLocalTime('2026-10-16', '00:00')))
    h.db.put('loans', 'ativo', makeActiveLoan())

    expect((await getDeskSummary()).returnsToday).toBe(3)
  })

  it('conta os lugares na vez esperando confirmação, e não os que aguardam', async () => {
    putEntry(h.db, 'q1', { status: 'your_turn' })
    putEntry(h.db, 'q2', { status: 'your_turn', studentUid: 'uid_marina' })
    putEntry(h.db, 'q3', { status: 'waiting', studentUid: 'uid_carlos' })
    putEntry(h.db, 'q4', { status: 'fulfilled', studentUid: 'uid_ana' })

    expect((await getDeskSummary()).queueAwaitingConfirm).toBe(2)
  })

  it('conta as multas em aberto, não as que ainda correm nem as pagas', async () => {
    h.db.put('fines', 'f1', makeFine({ status: 'open', amountCents: 600 }))
    h.db.put('fines', 'f2', makeFine({ status: 'open', amountCents: 200 }))
    h.db.put('fines', 'f3', makeFine({ status: 'accruing' }))
    h.db.put('fines', 'f4', makeFine({ status: 'paid', amountCents: 400 }))

    expect((await getDeskSummary()).openFines).toBe(2)
  })
})
