import { formatDayMonth, localDate } from '../../../shared/calendar/dates.js'
import { formatMoney } from '../../../shared/money.js'
import {
  NOTIFICATION_ACTION,
  NOTIFICATION_TYPE,
  type FineRecord,
  type LoanRecord,
  type UserNotification,
} from '../../../shared/types/index.js'
import { newNotice } from './notice.rules.js'

// Avisos dentro do app que os empréstimos e as multas geram (seção 2.14): pedido
// pronto, retirada, renovação, devolução e multa. Funções puras: devolvem o
// documento users/{uid}/notifications. Os avisos de prazo (lembrete, atraso, último
// dia de retirada e pedido expirado) são da rotina agendada.

type NoticeLoan = Pick<LoanRecord, 'id' | 'bookId' | 'bookTitle'>
type NoticeFine = Pick<
  FineRecord,
  'id' | 'loanId' | 'bookId' | 'bookTitle' | 'amountCents' | 'businessDaysLate'
>

// "Pedido pronto" (RF-EMP-07): o exemplar está guardado e o aluno tem até o prazo
// para retirar, com o QR ou o código.
export function pickupReadyNotice(
  loan: NoticeLoan & Pick<LoanRecord, 'pickupCode' | 'pickupDeadline'>,
  at: Date,
): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.pickupReady,
      title: `Pedido pronto: ${loan.bookTitle}`,
      body: `Retire até ${formatDayMonth(localDate(loan.pickupDeadline))}. Código ${loan.pickupCode}.`,
      bookId: loan.bookId,
      loanId: loan.id,
      action: NOTIFICATION_ACTION.showQr,
    },
    at,
  )
}

// Retirada registrada no balcão (RF-BAL-02): o empréstimo começou.
export function pickedUpNotice(
  loan: NoticeLoan & { dueAt: Date },
  at: Date,
): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.loanPickedUp,
      title: `Retirada registrada: ${loan.bookTitle}`,
      body: `Devolva até ${formatDayMonth(localDate(loan.dueAt))}.`,
      bookId: loan.bookId,
      loanId: loan.id,
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )
}

// Renovação feita (RF-EMP-09): o novo vencimento.
export function renewalDoneNotice(
  loan: NoticeLoan & { dueAt: Date },
  at: Date,
): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.renewalDone,
      title: `Renovação feita: ${loan.bookTitle}`,
      body: `Novo prazo de devolução: ${formatDayMonth(localDate(loan.dueAt))}.`,
      bookId: loan.bookId,
      loanId: loan.id,
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )
}

// Devolução registrada no balcão (RF-BAL-04).
export function returnConfirmedNotice(
  loan: NoticeLoan,
  at: Date,
): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.returnConfirmed,
      title: `Devolução registrada: ${loan.bookTitle}`,
      body: 'O livro voltou para a biblioteca. Obrigado!',
      bookId: loan.bookId,
      loanId: loan.id,
      action: NOTIFICATION_ACTION.none,
    },
    at,
  )
}

// Multa em aberto depois da devolução com atraso (RF-MUL-02): o valor e onde pagar.
export function fineOpenNotice(fine: NoticeFine, at: Date): UserNotification {
  const days = fine.businessDaysLate ?? 0
  return newNotice(
    {
      type: NOTIFICATION_TYPE.fineOpen,
      title: `Multa em aberto: ${fine.bookTitle}`,
      body: `${formatMoney(fine.amountCents ?? 0)} por ${days} ${days === 1 ? 'dia útil' : 'dias úteis'} de atraso. O pagamento é feito no balcão da biblioteca.`,
      bookId: fine.bookId,
      loanId: fine.loanId,
      fineId: fine.id,
      action: NOTIFICATION_ACTION.openFine,
    },
    at,
  )
}

// Pagamento da multa registrado no balcão (RF-MUL-03, RF-BAL-09).
export function finePaidNotice(fine: NoticeFine, at: Date): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.finePaid,
      title: `Multa paga: ${fine.bookTitle}`,
      body: `Pagamento de ${formatMoney(fine.amountCents ?? 0)} registrado no balcão.`,
      bookId: fine.bookId,
      loanId: fine.loanId,
      fineId: fine.id,
      action: NOTIFICATION_ACTION.none,
    },
    at,
  )
}

// Último dia para retirar o pedido (RF-SIS-05): hoje é o prazo.
export function pickupExpiringNotice(
  loan: NoticeLoan & Pick<LoanRecord, 'pickupCode'>,
  at: Date,
): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.pickupExpiring,
      title: `Último dia para retirar: ${loan.bookTitle}`,
      body: `Retire hoje, até o fechamento da biblioteca, com o código ${loan.pickupCode}. Depois disso o pedido expira.`,
      bookId: loan.bookId,
      loanId: loan.id,
      action: NOTIFICATION_ACTION.showQr,
    },
    at,
  )
}

// Pedido que não foi retirado no prazo (RF-EMP-06): expirou e o exemplar voltou.
export function pickupExpiredNotice(
  loan: NoticeLoan,
  at: Date,
): UserNotification {
  return newNotice(
    {
      type: NOTIFICATION_TYPE.pickupExpired,
      title: `Pedido expirado: ${loan.bookTitle}`,
      body: `Seu pedido de ${loan.bookTitle} expirou. Não foi retirado em 2 dias úteis e o exemplar voltou para o acervo.`,
      bookId: loan.bookId,
      loanId: loan.id,
      action: NOTIFICATION_ACTION.none,
    },
    at,
  )
}

// O que o lembrete de prazo precisa saber do livro e das regras.
export interface DueReminderContext {
  // Pessoas na fila do livro.
  queueLength: number
  // Renovações já feitas e o máximo permitido (settings/library).
  renewalCount: number
  maxRenewals: number
  // Multa por dia útil de atraso, em centavos.
  ratePerBusinessDayCents: number
}

// Quantas pessoas, no singular ou no plural.
const peopleIn = (count: number) =>
  count === 1 ? '1 pessoa' : `${count} pessoas`

// Lembrete de prazo do empréstimo ativo (RF-SIS-05): dois dias antes, no dia do
// vencimento e, depois dele, o aviso de atraso com o valor da multa.
export function dueReminderNotice(
  kind: 'due2Days' | 'dueDay' | 'overdue',
  loan: NoticeLoan & { dueAt: Date },
  context: DueReminderContext,
  at: Date,
): UserNotification {
  const due = formatDayMonth(localDate(loan.dueAt))
  const refs = { bookId: loan.bookId, loanId: loan.id }

  if (kind === 'overdue') {
    return newNotice(
      {
        type: NOTIFICATION_TYPE.overdue,
        title: `Livro atrasado: ${loan.bookTitle}`,
        body: `O prazo era ${due}. A multa é de ${formatMoney(context.ratePerBusinessDayCents)} por dia útil de atraso, até a devolução.`,
        ...refs,
        action: NOTIFICATION_ACTION.openLoan,
      },
      at,
    )
  }

  const renewal =
    context.queueLength > 0
      ? `Há ${peopleIn(context.queueLength)} na fila, então não dá para renovar.`
      : context.renewalCount < context.maxRenewals
        ? 'Você ainda pode renovar uma vez.'
        : 'Este empréstimo já foi renovado, então devolva no prazo.'
  return newNotice(
    {
      type: NOTIFICATION_TYPE.dueReminder,
      title:
        kind === 'dueDay'
          ? `${loan.bookTitle} vence hoje`
          : `${loan.bookTitle} vence em 2 dias`,
      body:
        kind === 'dueDay'
          ? `Devolva hoje, até o fechamento da biblioteca. ${renewal}`
          : `Devolva até ${due}. ${renewal}`,
      ...refs,
      action: NOTIFICATION_ACTION.openLoan,
    },
    at,
  )
}
