import {
  NOTIFICATION_ACTION,
  NOTIFICATION_TYPE,
  type LoanRecord,
  type UserNotification,
} from '../../../shared/types/index.js'
import type { FrozenFineSummary } from '../../fines/services/fine-freeze.service.js'
import { buildNotification } from '../../notifications/rules/notification.rules.js'

type LoanNoticeRelations = Pick<UserNotification, 'fineId'>

function notice(
  loan: Pick<LoanRecord, 'id' | 'bookId' | 'bookTitle'>,
  fields: Pick<UserNotification, 'type' | 'title' | 'body' | 'action'>,
  at: Date,
  relations: Partial<LoanNoticeRelations> = {},
): UserNotification {
  return buildNotification(
    fields,
    { bookId: loan.bookId, loanId: loan.id, ...relations },
    at,
  )
}

export const pickedUpNotice = (loan: LoanRecord, at: Date) =>
  notice(
    loan,
    {
      type: NOTIFICATION_TYPE.loanPickedUp,
      title: `Retirada confirmada: ${loan.bookTitle}`,
      body: 'O livro foi retirado. Consulte o vencimento em Meus empréstimos.',
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )

export const returnedNotice = (loan: LoanRecord, at: Date) =>
  notice(
    loan,
    {
      type: NOTIFICATION_TYPE.returnConfirmed,
      title: `Devolução confirmada: ${loan.bookTitle}`,
      body: 'A devolução foi registrada pela biblioteca.',
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )

export const pickupExpiredNotice = (loan: LoanRecord, at: Date) =>
  notice(
    loan,
    {
      type: NOTIFICATION_TYPE.pickupExpired,
      title: `Prazo de retirada encerrado: ${loan.bookTitle}`,
      body: 'O pedido expirou e o exemplar foi liberado.',
      action: NOTIFICATION_ACTION.none,
    },
    at,
  )

export function fineNotice(
  loan: LoanRecord,
  fine: FrozenFineSummary,
  at: Date,
): UserNotification {
  const paid = fine.status === 'paid'
  const amount = (fine.amountCents / 100).toFixed(2).replace('.', ',')
  return notice(
    loan,
    {
      type: paid ? NOTIFICATION_TYPE.finePaid : NOTIFICATION_TYPE.fineOpen,
      title: paid ? 'Multa paga' : 'Multa em aberto',
      body: paid
        ? `O pagamento de R$ ${amount} foi registrado.`
        : `A devolução gerou multa de R$ ${amount}. Pague no balcão.`,
      action: NOTIFICATION_ACTION.openFine,
    },
    at,
    { fineId: fine.id },
  )
}
