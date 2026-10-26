import { nowOf } from '../../../shared/clock.js'
import { localDate } from '../../../shared/calendar/dates.js'
import { displayNameOf } from '../../../shared/domain/user.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { hasOverdueLoan as circulationHasOverdue } from '../../../shared/rules/request-eligibility.js'
import { isOverdue } from '../../../shared/time.js'
import {
  LOAN_STATUS,
  OPEN_LOAN_STATUSES,
  QUEUE_ENTRY_STATUS,
  type LoanRecord,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'
import * as queueEntriesRepository from '../../queues/repositories/queue-entries.repository.js'
import { deskStudentNotFound } from '../desk.errors.js'
import { toDeskLoan, toPickupItem } from '../rules/desk-view.rules.js'

const inProgress = (loan: LoanRecord) =>
  OPEN_LOAN_STATUSES.some((status) => status === loan.status)

export async function getDashboard() {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const [pickups, queueTurns, active, returned] = await Promise.all([
    loansRepository.listByStatus(LOAN_STATUS.awaitingPickup),
    queueEntriesRepository.listByStatus(QUEUE_ENTRY_STATUS.yourTurn),
    loansRepository.listByStatus(LOAN_STATUS.active),
    loansRepository.listByStatus(LOAN_STATUS.returned),
  ])
  const today = localDate(at)

  return {
    pendingPickups: pickups.length,
    queueTurnsAwaitingConfirmation: queueTurns.length,
    overdueLoans: active.filter(
      (loan) => loan.dueAt && isOverdue(loan.dueAt, at),
    ).length,
    returnsToday: returned.filter(
      (loan) => loan.returnedAt && localDate(loan.returnedAt) === today,
    ).length,
  }
}

export async function listPendingPickups(matricula?: string) {
  const items = await loansRepository.listAwaitingPickup(matricula)
  return { items: items.map(toPickupItem) }
}

export async function lookupStudent(identifier: string) {
  const normalized = identifier.trim()
  const matchedLoan = /^\d{7}$/.test(normalized)
    ? undefined
    : await loansRepository.findAwaitingByIdentifier(normalized)
  const account = await usersRepository.findByMatricula(
    matchedLoan?.matricula ?? normalized,
  )
  if (!account) throw deskStudentNotFound()
  const [student, allLoans, settings] = await Promise.all([
    usersRepository.findById(account.uid),
    loansRepository.listByStudent(account.uid),
    readLoanSettings(),
  ])
  if (!student) throw deskStudentNotFound()
  const loans = allLoans.filter(inProgress)
  const at = nowOf(settings)
  return {
    student: {
      uid: account.uid,
      matricula: student.matricula,
      name: displayNameOf(student),
      email: student.email,
      activeLoanCount: student.activeLoanCount,
      activeQueueCount: student.activeQueueCount,
      openFineTotalCents: student.openFineTotalCents,
    },
    selectedLoanId: matchedLoan?.id ?? null,
    hasOverdueLoan: circulationHasOverdue(
      {
        activeLoanCount: student.activeLoanCount,
        activeQueueCount: student.activeQueueCount,
        openLoans: loans,
      },
      at,
    ),
    loans: loans.map(toDeskLoan),
  }
}
