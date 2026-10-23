import { describe, expect, it } from 'vitest'
import { addBusinessDays } from '../../../shared/calendar/business-days.js'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import { DEFAULT_OPENING_HOURS } from '../../../shared/library.js'
import {
  confirmDeadlineOf,
  confirmDenialOf,
  isTurnExpired,
  turnStartFields,
} from '../rules/turn.rules.js'
import { NOW, makeEntry } from './queue.fixtures.js'

describe('prazo para confirmar a vez (confirmDeadlineOf, RF-FIL-06)', () => {
  it('são 24 horas corridas depois de a vez começar', () => {
    expect(confirmDeadlineOf(NOW, 24)).toEqual(
      atLocalTime('2026-10-17', '09:12'),
    )
  })

  it('as horas corridas atravessam o fim de semana, sem pular dia', () => {
    // Vez começou na sexta às 21h; 24h depois é sábado às 21h.
    expect(confirmDeadlineOf(atLocalTime('2026-10-16', '21:00'), 24)).toEqual(
      atLocalTime('2026-10-17', '21:00'),
    )
  })

  it('usa as horas de settings/library', () => {
    expect(confirmDeadlineOf(NOW, 12)).toEqual(
      atLocalTime('2026-10-16', '21:12'),
    )
  })
})

describe('começar a vez (turnStartFields, RF-FIL-06)', () => {
  it('põe o 1º da fila na vez, com o prazo, o exemplar guardado e o aviso contado', () => {
    expect(
      turnStartFields({ copyId: 'copy1', at: NOW, confirmHours: 24 }),
    ).toEqual({
      status: 'your_turn',
      turnStartedAt: NOW,
      confirmDeadline: atLocalTime('2026-10-17', '09:12'),
      reservedCopyId: 'copy1',
      lastNotifiedAt: NOW,
      notifyCount: 1,
      updatedAt: NOW,
    })
  })
})

describe('2 dias úteis para retirar depois de confirmar (RF-FIL-06)', () => {
  it('confirmou na sexta 16/10: pode retirar até terça 20/10, no fechamento', () => {
    // Segunda 19/10 e terça 20/10 são os 2 dias úteis; o fim de semana não conta.
    const calendar = {
      openingHours: DEFAULT_OPENING_HOURS,
      closedDates: new Set<string>(),
    }

    expect(addBusinessDays(NOW, 2, calendar)).toEqual(
      atLocalTime('2026-10-20', '21:55'),
    )
  })
})

describe('vez vencida (isTurnExpired, RF-FIL-07)', () => {
  const turn = makeEntry({
    status: 'your_turn',
    confirmDeadline: atLocalTime('2026-10-17', '09:12'),
  })

  it('antes do prazo ainda dá tempo', () => {
    expect(isTurnExpired(turn, atLocalTime('2026-10-17', '09:11'))).toBe(false)
  })

  it('no instante exato do prazo ainda dá tempo', () => {
    expect(isTurnExpired(turn, atLocalTime('2026-10-17', '09:12'))).toBe(false)
  })

  it('perdeu o prazo: passou das 24h', () => {
    expect(
      isTurnExpired(turn, new Date(turn.confirmDeadline!.getTime() + 1)),
    ).toBe(true)
  })

  it('quem ainda espera (waiting) não tem prazo para perder', () => {
    expect(isTurnExpired(makeEntry(), atLocalTime('2030-01-01', '09:00'))).toBe(
      false,
    )
  })

  it('quem já saiu da fila não vence', () => {
    expect(
      isTurnExpired(
        makeEntry({ status: 'left', confirmDeadline: turn.confirmDeadline }),
        atLocalTime('2030-01-01', '09:00'),
      ),
    ).toBe(false)
  })
})

describe('pode confirmar a vez? (confirmDenialOf)', () => {
  const turn = makeEntry({
    status: 'your_turn',
    confirmDeadline: atLocalTime('2026-10-17', '09:12'),
  })

  it('na vez e dentro do prazo, pode', () => {
    expect(confirmDenialOf(turn, NOW)).toBeNull()
  })

  it('ainda esperando: not_your_turn', () => {
    expect(confirmDenialOf(makeEntry(), NOW)).toBe('not_your_turn')
  })

  it('passou das 24h: turn_expired', () => {
    expect(confirmDenialOf(turn, atLocalTime('2026-10-17', '09:13'))).toBe(
      'turn_expired',
    )
  })

  it('lugar que já saiu da fila: queue_entry_not_active', () => {
    for (const status of [
      'left',
      'missed',
      'removed',
      'fulfilled',
      'cancelled_other_edition',
    ] as const) {
      expect(confirmDenialOf(makeEntry({ status }), NOW)).toBe(
        'queue_entry_not_active',
      )
    }
  })
})
