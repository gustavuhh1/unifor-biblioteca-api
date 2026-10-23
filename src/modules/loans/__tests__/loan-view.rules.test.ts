import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  belongsToView,
  displayStateOf,
  progressOf,
  toLoanResponse,
} from '../rules/loan-view.rules.js'
import {
  NOW,
  makeActiveLoan,
  makeLoan,
  makeLoanRecord,
} from './loan.fixtures.js'

const ctx = { at: NOW, dueSoonDays: 2, renewalDenial: null } as const

describe('estado mostrado ao aluno (displayStateOf)', () => {
  const state = (loan: Parameters<typeof displayStateOf>[0], at = NOW) =>
    displayStateOf(loan, at, 2)

  it('pedido aguardando retirada é Pronto para retirar', () => {
    expect(state(makeLoan())).toBe('ready_for_pickup')
  })

  it('ativo com muito prazo é Em andamento', () => {
    const loan = makeActiveLoan({ dueAt: atLocalTime('2026-10-23', '21:55') })

    expect(state(loan)).toBe('in_progress')
  })

  it('ativo que vence em até 2 dias é Vence em breve (amanhã, hoje no fechamento)', () => {
    expect(state(makeActiveLoan())).toBe('due_soon')
    expect(
      state(makeActiveLoan({ dueAt: atLocalTime('2026-10-15', '21:55') })),
    ).toBe('due_soon')
  })

  it('o limite de 2 dias é inclusivo e 2 dias e um minuto já é Em andamento', () => {
    const at = atLocalTime('2026-10-15', '12:00')
    const exact = new Date(at.getTime() + 2 * 24 * 60 * 60 * 1000)

    expect(state(makeActiveLoan({ dueAt: exact }), at)).toBe('due_soon')
    expect(
      state(makeActiveLoan({ dueAt: new Date(exact.getTime() + 60000) }), at),
    ).toBe('in_progress')
  })

  it('ativo com o vencimento passado é Atrasado', () => {
    const loan = makeActiveLoan({ dueAt: atLocalTime('2026-10-14', '21:55') })

    expect(state(loan)).toBe('overdue')
  })

  it('no instante do vencimento ainda não é Atrasado', () => {
    const loan = makeActiveLoan()

    expect(state(loan, loan.dueAt)).toBe('due_soon')
  })

  it('segue o dueSoonDays recebido', () => {
    const loan = makeActiveLoan({ dueAt: atLocalTime('2026-10-20', '21:55') })

    expect(displayStateOf(loan, NOW, 2)).toBe('in_progress')
    expect(displayStateOf(loan, NOW, 6)).toBe('due_soon')
  })

  it('devolvido, expirado e cancelado repetem o status', () => {
    expect(state(makeLoan({ status: 'returned' }))).toBe('returned')
    expect(state(makeLoan({ status: 'expired' }))).toBe('expired')
    expect(state(makeLoan({ status: 'cancelled' }))).toBe('cancelled')
  })
})

describe('progresso do prazo (progressOf)', () => {
  it('pedido para retirar: do pedido até o fim do prazo de retirada', () => {
    const loan = makeLoan({
      requestedAt: atLocalTime('2026-10-15', '00:00'),
      pickupDeadline: atLocalTime('2026-10-17', '00:00'),
    })

    expect(progressOf(loan, atLocalTime('2026-10-16', '00:00'))).toBe(0.5)
  })

  it('empréstimo ativo: da retirada até o vencimento', () => {
    const loan = makeActiveLoan({
      pickedUpAt: atLocalTime('2026-10-01', '00:00'),
      dueAt: atLocalTime('2026-10-11', '00:00'),
    })

    expect(progressOf(loan, atLocalTime('2026-10-03', '12:00'))).toBe(0.25)
  })

  it('nunca passa de 1 (atrasado) nem fica abaixo de 0', () => {
    const loan = makeActiveLoan()

    expect(progressOf(loan, atLocalTime('2026-11-30', '12:00'))).toBe(1)
    expect(progressOf(loan, atLocalTime('2026-09-01', '12:00'))).toBe(0)
  })

  it('o histórico não tem progresso', () => {
    for (const status of ['returned', 'expired', 'cancelled'] as const) {
      expect(progressOf(makeLoan({ status }), NOW)).toBeNull()
    }
  })

  it('prazo de duração zero conta como completo', () => {
    const loan = makeLoan({ requestedAt: NOW, pickupDeadline: NOW })

    expect(progressOf(loan, NOW)).toBe(1)
  })
})

describe('aba de Meus empréstimos (belongsToView)', () => {
  it('active traz pedido para retirar e empréstimo ativo', () => {
    expect(belongsToView(makeLoan(), 'active')).toBe(true)
    expect(belongsToView(makeActiveLoan(), 'active')).toBe(true)
    expect(belongsToView(makeLoan({ status: 'returned' }), 'active')).toBe(
      false,
    )
  })

  it('history traz devolvido, expirado e cancelado', () => {
    for (const status of ['returned', 'expired', 'cancelled'] as const) {
      expect(belongsToView(makeLoan({ status }), 'history')).toBe(true)
    }
    expect(belongsToView(makeLoan(), 'history')).toBe(false)
    expect(belongsToView(makeActiveLoan(), 'history')).toBe(false)
  })
})

describe('pedido ou empréstimo da resposta (toLoanResponse)', () => {
  it('pedido para retirar: leva o código e o segredo do QR e não pode renovar', () => {
    const response = toLoanResponse(makeLoanRecord('loan1'), ctx)

    expect(response).toMatchObject({
      id: 'loan1',
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      bookShelf: 'Estante 005.1',
      status: 'awaiting_pickup',
      state: 'ready_for_pickup',
      pickupCode: 'RET-4821',
      qrToken: 'qr-token-de-teste-aaaaaaaaaaaaaaaaaaa',
      pickedUpAt: null,
      dueAt: null,
      canRenew: false,
      renewalDenialReason: null,
      renewalCount: 0,
    })
    expect(response.requestedAt).toBe(NOW.toISOString())
    expect(response.pickupDeadline).toBe('2026-10-20T00:55:00.000Z')
    expect(response.progress).toBeGreaterThanOrEqual(0)
  })

  it('empréstimo ativo: sem código nem QR, com vencimento e podendo renovar', () => {
    const response = toLoanResponse(
      makeLoanRecord('loan2', makeActiveLoan()),
      ctx,
    )

    expect(response).toMatchObject({
      status: 'active',
      state: 'due_soon',
      pickupCode: null,
      qrToken: null,
      dueAt: '2026-10-17T00:55:00.000Z',
      canRenew: true,
      renewalDenialReason: null,
    })
  })

  it('empréstimo ativo com a renovação negada traz o motivo', () => {
    const response = toLoanResponse(makeLoanRecord('loan3', makeActiveLoan()), {
      ...ctx,
      renewalDenial: 'has_queue',
    })

    expect(response).toMatchObject({
      canRenew: false,
      renewalDenialReason: 'has_queue',
    })
  })

  it('o histórico não mostra motivo de renovação nem progresso', () => {
    const response = toLoanResponse(
      makeLoanRecord('loan4', {
        status: 'returned',
        returnedAt: atLocalTime('2026-10-10', '10:00'),
      }),
      { ...ctx, renewalDenial: 'overdue' },
    )

    expect(response).toMatchObject({
      state: 'returned',
      canRenew: false,
      renewalDenialReason: null,
      progress: null,
      pickupCode: null,
      returnedAt: '2026-10-10T13:00:00.000Z',
    })
  })
})
