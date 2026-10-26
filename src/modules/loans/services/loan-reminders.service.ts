import { getDb } from '../../../config/firebase.js'
import {
  atLocalTime,
  localDate,
  plusDays,
} from '../../../shared/calendar/dates.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import { LOAN_STATUS, NOTIFICATION_TYPE } from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import {
  dueReminderNotice,
  pickupExpiringNotice,
} from '../../notifications/rules/loan-notices.rules.js'
import { dueReminderOf, isLastPickupDay } from '../rules/reminder.rules.js'

// Lembretes de prazo (RF-SIS-05, rotina `due_reminders`). QUEM CHAMA: a rota do
// Cloud Scheduler do módulo `jobs`, uma vez por dia de manhã, passando o "agora" das
// regras de negócio (shared/clock). Cada aviso é gravado numa transação própria,
// com o empréstimo conferido de novo, e `loans.remindersSent` guarda quando saiu,
// então rodar a rotina duas vezes no mesmo dia não repete nenhum aviso.

// Empréstimos ativos que vencem até o fim de hoje + 2 dias, e os já atrasados: tudo
// o que pode precisar de lembrete.
async function remindDueLoans(at: Date): Promise<number> {
  const settings = await readLoanSettings()
  const limit = atLocalTime(plusDays(localDate(at), 3), '00:00')
  let sent = 0

  for (const { id } of await loansRepository.listActiveDueBefore(limit)) {
    const done = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(id, tx)
      if (!loan || loan.status !== LOAN_STATUS.active || !loan.dueAt) {
        return false
      }
      const kind = dueReminderOf(loan, at)
      if (!kind) return false

      const book = await booksRepository.findById(loan.bookId, tx)
      if (!book) throw new Error('Livro do empréstimo não encontrado.')

      notificationsRepository.create(
        tx,
        loan.studentUid,
        dueReminderNotice(
          kind,
          { ...loan, dueAt: loan.dueAt },
          {
            queueLength: book.queueLength,
            renewalCount: loan.renewalCount,
            maxRenewals: settings.maxRenewals,
            ratePerBusinessDayCents: settings.fineCentsPerBusinessDay,
          },
          at,
        ),
      )
      loansRepository.update(tx, loan.id, {
        remindersSent: { ...loan.remindersSent, [kind]: at },
        updatedAt: at,
      })
      return true
    })
    if (done) sent++
  }
  return sent
}

// Pedidos aguardando retirada cujo prazo termina hoje: um aviso de "último dia".
async function remindLastPickupDay(at: Date): Promise<number> {
  const today = localDate(at)
  const pickups = await loansRepository.listAwaitingPickupDueBetween(
    atLocalTime(today, '00:00'),
    atLocalTime(plusDays(today, 1), '00:00'),
  )
  let sent = 0

  for (const { id } of pickups) {
    const done = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(id, tx)
      if (
        !loan ||
        loan.status !== LOAN_STATUS.awaitingPickup ||
        !isLastPickupDay(loan, at)
      ) {
        return false
      }
      const already = await notificationsRepository.existsForLoan(
        tx,
        loan.studentUid,
        loan.id,
        NOTIFICATION_TYPE.pickupExpiring,
      )
      if (already) return false

      notificationsRepository.create(
        tx,
        loan.studentUid,
        pickupExpiringNotice(loan, at),
      )
      return true
    })
    if (done) sent++
  }
  return sent
}

// Manda os lembretes de prazo do dia e devolve quantos avisos saíram.
export async function sendDueReminders(at: Date): Promise<number> {
  const [dueLoans, pickups] = await Promise.all([
    remindDueLoans(at),
    remindLastPickupDay(at),
  ])
  return dueLoans + pickups
}
