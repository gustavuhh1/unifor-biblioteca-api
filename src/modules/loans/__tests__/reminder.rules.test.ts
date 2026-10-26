import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import { isPickupExpired } from '../rules/expiration.rules.js'
import { dueReminderOf, isLastPickupDay } from '../rules/reminder.rules.js'

// Hoje é quinta 15/10, 8h da manhã (a hora em que a rotina dos lembretes roda).
const AT = atLocalTime('2026-10-15', '08:00')
const dueOn = (date: string, time = '21:55') => atLocalTime(date, time)

describe('lembrete de prazo do empréstimo (dueReminderOf, RF-SIS-05)', () => {
  it('vence daqui a 2 dias: lembrete de 2 dias', () => {
    expect(
      dueReminderOf({ dueAt: dueOn('2026-10-17'), remindersSent: {} }, AT),
    ).toBe('due2Days')
  })

  it('vence hoje, ainda no prazo: lembrete do dia', () => {
    expect(
      dueReminderOf({ dueAt: dueOn('2026-10-15'), remindersSent: {} }, AT),
    ).toBe('dueDay')
  })

  it('o prazo passou: aviso de atraso', () => {
    expect(
      dueReminderOf({ dueAt: dueOn('2026-10-14'), remindersSent: {} }, AT),
    ).toBe('overdue')
  })

  it('vence hoje mas o horário já passou: já é atraso', () => {
    const lateAt = atLocalTime('2026-10-15', '22:30')

    expect(
      dueReminderOf({ dueAt: dueOn('2026-10-15'), remindersSent: {} }, lateAt),
    ).toBe('overdue')
  })

  it('outros dias não têm lembrete: 1 dia, 3 dias ou mais', () => {
    for (const date of ['2026-10-16', '2026-10-18', '2026-10-29']) {
      expect(
        dueReminderOf({ dueAt: dueOn(date), remindersSent: {} }, AT),
      ).toBeUndefined()
    }
  })

  it('o lembrete que já saiu não sai de novo', () => {
    const sentAt = atLocalTime('2026-10-14', '08:00')

    expect(
      dueReminderOf(
        { dueAt: dueOn('2026-10-17'), remindersSent: { due2Days: sentAt } },
        AT,
      ),
    ).toBeUndefined()
    expect(
      dueReminderOf(
        { dueAt: dueOn('2026-10-15'), remindersSent: { dueDay: sentAt } },
        AT,
      ),
    ).toBeUndefined()
    expect(
      dueReminderOf(
        { dueAt: dueOn('2026-10-14'), remindersSent: { overdue: sentAt } },
        AT,
      ),
    ).toBeUndefined()
  })

  it('empréstimo sem vencimento não tem lembrete', () => {
    expect(dueReminderOf({ remindersSent: {} }, AT)).toBeUndefined()
  })

  it('um lembrete que saiu não impede o seguinte', () => {
    const sentAt = atLocalTime('2026-10-13', '08:00')

    expect(
      dueReminderOf(
        { dueAt: dueOn('2026-10-15'), remindersSent: { due2Days: sentAt } },
        AT,
      ),
    ).toBe('dueDay')
  })
})

describe('último dia para retirar (isLastPickupDay, RF-SIS-05)', () => {
  it('o prazo termina hoje, mais tarde', () => {
    expect(isLastPickupDay({ pickupDeadline: dueOn('2026-10-15') }, AT)).toBe(
      true,
    )
  })

  it('o prazo é outro dia ou já passou', () => {
    expect(isLastPickupDay({ pickupDeadline: dueOn('2026-10-16') }, AT)).toBe(
      false,
    )
    expect(
      isLastPickupDay(
        { pickupDeadline: atLocalTime('2026-10-15', '07:00') },
        AT,
      ),
    ).toBe(false)
  })
})

describe('pedido expirado (isPickupExpired, RF-EMP-06)', () => {
  const deadline = dueOn('2026-10-14')

  it('aguardando retirada com o prazo vencido expira', () => {
    expect(
      isPickupExpired(
        { status: 'awaiting_pickup', pickupDeadline: deadline },
        AT,
      ),
    ).toBe(true)
  })

  it('no instante exato do prazo ainda dá tempo', () => {
    expect(
      isPickupExpired(
        { status: 'awaiting_pickup', pickupDeadline: deadline },
        deadline,
      ),
    ).toBe(false)
  })

  it('só o pedido aguardando retirada expira', () => {
    for (const status of [
      'active',
      'returned',
      'cancelled',
      'expired',
    ] as const) {
      expect(isPickupExpired({ status, pickupDeadline: deadline }, AT)).toBe(
        false,
      )
    }
  })
})
