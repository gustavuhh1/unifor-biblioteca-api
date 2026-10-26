import { formatLocalDateTime } from '../../../shared/calendar/dates.js'
import {
  NOTIFICATION_ACTION,
  NOTIFICATION_TYPE,
  type LoanRecord,
  type UserNotification,
} from '../../../shared/types/index.js'
import { buildNotification } from '../../notifications/rules/notification.rules.js'

function notice(
  loan: LoanRecord,
  fields: Pick<UserNotification, 'type' | 'title' | 'body' | 'action'>,
  at: Date,
): UserNotification {
  return buildNotification(fields, { bookId: loan.bookId, loanId: loan.id }, at)
}

export function dueReminderNotice(
  loan: LoanRecord & { dueAt: Date },
  kind: 'due2Days' | 'dueDay',
  at: Date,
): UserNotification {
  return notice(
    loan,
    {
      type: NOTIFICATION_TYPE.dueReminder,
      title:
        kind === 'dueDay'
          ? `Vence hoje: ${loan.bookTitle}`
          : `Devolução próxima: ${loan.bookTitle}`,
      body: `Devolva até ${formatLocalDateTime(loan.dueAt)} para evitar multa.`,
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )
}

export function overdueNotice(
  loan: LoanRecord & { dueAt: Date },
  at: Date,
): UserNotification {
  return notice(
    loan,
    {
      type: NOTIFICATION_TYPE.overdue,
      title: `Livro em atraso: ${loan.bookTitle}`,
      body: 'Devolva o livro no balcão. A multa conta por dia útil de atraso.',
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )
}
