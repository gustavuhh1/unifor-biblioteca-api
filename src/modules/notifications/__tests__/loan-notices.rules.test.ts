import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  dueReminderNotice,
  fineOpenNotice,
  finePaidNotice,
  pickedUpNotice,
  pickupExpiredNotice,
  pickupExpiringNotice,
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

describe('avisos de prazo (RF-SIS-05, RF-EMP-06)', () => {
  const due = { ...loan, dueAt: atLocalTime('2026-10-17', '14:10') }
  const free = {
    queueLength: 0,
    renewalCount: 0,
    maxRenewals: 1,
    ratePerBusinessDayCents: 200,
  }

  it('lembrete de 2 dias: prazo e dica de renovar', () => {
    expect(dueReminderNotice('due2Days', due, free, AT)).toMatchObject({
      type: 'due_reminder',
      title: 'Código Limpo vence em 2 dias',
      body: 'Devolva até sáb, 17/10. Você ainda pode renovar uma vez.',
      action: 'open_loan',
      bookId: 'book1',
      loanId: 'loan1',
    })
  })

  it('lembrete do dia do vencimento', () => {
    expect(dueReminderNotice('dueDay', due, free, AT)).toMatchObject({
      type: 'due_reminder',
      title: 'Código Limpo vence hoje',
      body: 'Devolva hoje, até o fechamento da biblioteca. Você ainda pode renovar uma vez.',
    })
  })

  it('com fila, o singular e o plural de "pessoa"', () => {
    const one = dueReminderNotice(
      'due2Days',
      due,
      { ...free, queueLength: 1 },
      AT,
    )
    const many = dueReminderNotice(
      'due2Days',
      due,
      { ...free, queueLength: 3 },
      AT,
    )

    expect(one.body).toContain(
      'Há 1 pessoa na fila, então não dá para renovar.',
    )
    expect(many.body).toContain(
      'Há 3 pessoas na fila, então não dá para renovar.',
    )
  })

  it('já renovado e sem fila: devolva no prazo', () => {
    const notice = dueReminderNotice(
      'due2Days',
      due,
      { ...free, renewalCount: 1 },
      AT,
    )

    expect(notice.body).toContain('Este empréstimo já foi renovado')
  })

  it('atraso: prazo que passou e valor da multa por dia útil, sem falar de fila', () => {
    const notice = dueReminderNotice(
      'overdue',
      due,
      { ...free, queueLength: 4 },
      AT,
    )

    expect(notice).toMatchObject({
      type: 'overdue',
      title: 'Livro atrasado: Código Limpo',
      body: 'O prazo era sáb, 17/10. A multa é de R$ 2,00 por dia útil de atraso, até a devolução.',
      action: 'open_loan',
    })
  })

  it('último dia para retirar: o código e o botão do QR', () => {
    expect(
      pickupExpiringNotice({ ...loan, pickupCode: 'RET-4821' }, AT),
    ).toMatchObject({
      type: 'pickup_expiring',
      title: 'Último dia para retirar: Código Limpo',
      body: 'Retire hoje, até o fechamento da biblioteca, com o código RET-4821. Depois disso o pedido expira.',
      action: 'show_qr',
    })
  })

  it('pedido expirado: não foi retirado em 2 dias úteis', () => {
    expect(pickupExpiredNotice(loan, AT)).toMatchObject({
      type: 'pickup_expired',
      title: 'Pedido expirado: Código Limpo',
      body: 'Seu pedido de Código Limpo expirou. Não foi retirado em 2 dias úteis e o exemplar voltou para o acervo.',
      action: 'none',
    })
  })
})
