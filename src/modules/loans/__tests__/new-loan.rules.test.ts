import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import { buildNewLoan } from '../rules/new-loan.rules.js'
import { NOW } from './loan.fixtures.js'

const input = {
  student: { uid: 'uid_lucas', matricula: '2412858', name: 'Lucas Almeida' },
  book: {
    id: 'book1',
    workId: 'codigo-limpo--martin',
    title: 'Código Limpo',
    shelf: 'Estante 005.1',
  },
  copyId: 'copy1',
  pickupCode: 'RET-4821',
  qrToken: 'qr-token-de-teste-aaaaaaaaaaaaaaaaaaa',
  loanDays: 14,
  pickupDeadline: atLocalTime('2026-10-19', '21:55'),
  at: NOW,
}

describe('pedido novo (buildNewLoan)', () => {
  it('sem origem informada é um pedido direto, aguardando retirada (RF-EMP-01)', () => {
    const loan = buildNewLoan(input)

    expect(loan).toMatchObject({
      status: 'awaiting_pickup',
      origin: 'request',
      pickupDeadline: atLocalTime('2026-10-19', '21:55'),
      renewalCount: 0,
    })
    expect(loan).not.toHaveProperty('queueEntryId')
  })

  it('a vez confirmada na fila nasce com origem queue e o lugar da fila (RF-FIL-06)', () => {
    expect(
      buildNewLoan({ ...input, origin: 'queue', queueEntryId: 'qe1' }),
    ).toMatchObject({
      status: 'awaiting_pickup',
      origin: 'queue',
      queueEntryId: 'qe1',
    })
  })
})
