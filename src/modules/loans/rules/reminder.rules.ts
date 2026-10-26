import { daysBetween, localDate } from '../../../shared/calendar/dates.js'
import type { LoanRecord } from '../../../shared/types/index.js'

// Quais lembretes de prazo um empréstimo já pode receber (RF-SIS-05, seção 2.9).
// Funções puras: recebem o instante de referência, sem relógio escondido.

// Os três lembretes, com o nome das chaves de `loans.remindersSent`.
export type DueReminder = 'due2Days' | 'dueDay' | 'overdue'

// Quantos dias antes do vencimento sai o primeiro lembrete.
const DAYS_BEFORE_DUE = 2

// O lembrete que falta mandar do empréstimo ativo, ou nada:
// - vencido (passou do horário do vencimento): "atrasado", uma vez;
// - vence hoje: "vence hoje", uma vez;
// - vence daqui a 2 dias: "vence em 2 dias", uma vez.
// Cada um só sai se `remindersSent` ainda não tem a chave, então rodar a rotina de
// novo no mesmo dia não repete o aviso.
export function dueReminderOf(
  loan: Pick<LoanRecord, 'dueAt' | 'remindersSent'>,
  at: Date,
): DueReminder | undefined {
  if (!loan.dueAt) return undefined
  const sent = loan.remindersSent

  if (loan.dueAt.getTime() < at.getTime()) {
    return sent.overdue ? undefined : 'overdue'
  }
  const days = daysBetween(localDate(at), localDate(loan.dueAt))
  if (days === 0) return sent.dueDay ? undefined : 'dueDay'
  if (days === DAYS_BEFORE_DUE) return sent.due2Days ? undefined : 'due2Days'
  return undefined
}

// O pedido aguardando retirada vence hoje (é o último dia para retirar).
export function isLastPickupDay(
  loan: Pick<LoanRecord, 'pickupDeadline'>,
  at: Date,
): boolean {
  return (
    loan.pickupDeadline.getTime() > at.getTime() &&
    localDate(loan.pickupDeadline) === localDate(at)
  )
}
