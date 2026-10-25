import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  fineOpenNotice,
  finePaidNotice,
  pickedUpNotice,
  pickupReadyNotice,
  renewalDoneNotice,
  returnConfirmedNotice,
} from '../rules/loan-notices.rules.js'
import { newNotice } from '../rules/notice.rules.js'
import { AT } from './notifications.fixtures.js'

const loan = { id: 'loan1', bookId: 'book1', bookTitle: 'Código Limpo' }
const fine = {
  id: 'fine1',
  loanId: 'loan1',
  bookId: 'book1',
  bookTitle: 'Código Limpo',
  amountCents: 600,
  businessDaysLate: 3,
}

describe('aviso novo (newNotice)', () => {
  it('nasce com push e e-mail ainda por entregar e as datas do instante dado', () => {
    const notice = newNotice(
      { type: 'overdue', title: 'T', body: 'B', action: 'none' },
      AT,
    )

    expect(notice).toEqual({
      type: 'overdue',
      title: 'T',
      body: 'B',
      action: 'none',
      delivery: { push: 'skipped', email: 'skipped' },
      createdAt: AT,
      updatedAt: AT,
    })
  })
})

describe('avisos de empréstimo (RF-AVI-01)', () => {
  it('pedido pronto: o prazo de retirada, o código e o botão do QR', () => {
    const notice = pickupReadyNotice(
      {
        ...loan,
        pickupCode: 'RET-4821',
        pickupDeadline: atLocalTime('2026-10-29', '21:55'),
      },
      AT,
    )

    expect(notice).toMatchObject({
      type: 'pickup_ready',
      title: 'Pedido pronto: Código Limpo',
      body: 'Retire até qui, 29/10. Código RET-4821.',
      action: 'show_qr',
      bookId: 'book1',
      loanId: 'loan1',
    })
  })

  it('retirada registrada: devolva até o vencimento', () => {
    const notice = pickedUpNotice(
      { ...loan, dueAt: atLocalTime('2026-10-29', '21:55') },
      AT,
    )

    expect(notice).toMatchObject({
      type: 'loan_picked_up',
      title: 'Retirada registrada: Código Limpo',
      body: 'Devolva até qui, 29/10.',
      action: 'open_loan',
    })
  })

  it('renovação feita: o novo prazo', () => {
    const notice = renewalDoneNotice(
      { ...loan, dueAt: atLocalTime('2026-10-30', '21:55') },
      AT,
    )

    expect(notice).toMatchObject({
      type: 'renewal_done',
      body: 'Novo prazo de devolução: sex, 30/10.',
    })
  })

  it('devolução registrada: sem botão', () => {
    expect(returnConfirmedNotice(loan, AT)).toMatchObject({
      type: 'return_confirmed',
      title: 'Devolução registrada: Código Limpo',
      action: 'none',
    })
  })
})

describe('avisos de multa (RF-AVI-01)', () => {
  it('multa em aberto: valor, dias úteis no plural e onde pagar', () => {
    expect(fineOpenNotice(fine, AT)).toMatchObject({
      type: 'fine_open',
      body: 'R$ 6,00 por 3 dias úteis de atraso. O pagamento é feito no balcão da biblioteca.',
      action: 'open_fine',
      fineId: 'fine1',
      loanId: 'loan1',
    })
  })

  it('um dia útil de atraso fica no singular', () => {
    expect(
      fineOpenNotice({ ...fine, amountCents: 200, businessDaysLate: 1 }, AT)
        .body,
    ).toContain('R$ 2,00 por 1 dia útil de atraso')
  })

  it('multa paga: o valor registrado no balcão', () => {
    expect(finePaidNotice(fine, AT)).toMatchObject({
      type: 'fine_paid',
      title: 'Multa paga: Código Limpo',
      body: 'Pagamento de R$ 6,00 registrado no balcão.',
      action: 'none',
    })
  })
})
