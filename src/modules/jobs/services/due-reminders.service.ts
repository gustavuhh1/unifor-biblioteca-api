import { getDb } from '../../../config/firebase.js'
import { daysBetween, localDate } from '../../../shared/calendar/dates.js'
import { LOAN_STATUS, type RemindersSent } from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { dueReminderNotice, overdueNotice } from '../rules/job-notices.rules.js'

type ReminderKind = keyof RemindersSent

function reminderKind(
  dueAt: Date,
  reminders: RemindersSent,
  at: Date,
): ReminderKind | undefined {
  const days = daysBetween(localDate(at), localDate(dueAt))
  if (days === 2 && !reminders.due2Days) return 'due2Days'
  if (days === 0 && !reminders.dueDay) return 'dueDay'
  if (dueAt.getTime() < at.getTime() && !reminders.overdue) return 'overdue'
  return undefined
}

export async function sendDueReminders(at: Date) {
  const sent: string[] = []
  for (const candidate of await loansRepository.listByStatus(
    LOAN_STATUS.active,
  )) {
    if (!candidate.dueAt) continue
    const kind = reminderKind(candidate.dueAt, candidate.remindersSent, at)
    if (!kind) continue
    const didSend = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(candidate.id, tx)
      if (!loan?.dueAt || loan.status !== LOAN_STATUS.active) return false
      const currentKind = reminderKind(loan.dueAt, loan.remindersSent, at)
      if (currentKind !== kind) return false
      const student = await usersRepository.findById(loan.studentUid, tx)
      if (!student) {
        throw new Error(`Aluno do empréstimo ${loan.id} não encontrado.`)
      }
      // Atraso e multa são avisos obrigatórios; os dois lembretes anteriores ao
      // atraso respeitam a preferência do aluno.
      if (
        kind !== 'overdue' &&
        student.notificationPrefs?.dueReminders === false
      ) {
        return false
      }
      notificationsRepository.create(
        tx,
        loan.studentUid,
        kind === 'overdue'
          ? overdueNotice({ ...loan, dueAt: loan.dueAt }, at)
          : dueReminderNotice({ ...loan, dueAt: loan.dueAt }, kind, at),
      )
      loansRepository.update(tx, loan.id, {
        remindersSent: { ...loan.remindersSent, [kind]: at },
        updatedAt: at,
      })
      return true
    })
    if (didSend) sent.push(`${candidate.id}:${kind}`)
  }
  return { processed: sent.length, reminders: sent }
}
