import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { addCalendarDaysToClosing } from '../../../shared/calendar/business-days.js'
import { nowOf } from '../../../shared/clock.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { hasOverdueLoan } from '../../../shared/rules/request-eligibility.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  COPY_STATUS,
  LOAN_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'
import { pickedUpNotice } from '../../loans/rules/loan-notices.rules.js'
import { nextReturnAtOf } from '../../loans/rules/renewal.rules.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import {
  circulationInconsistent,
  deskLoanNotFound,
  pickupBlockedByOverdue,
  pickupExpired,
  pickupNotAllowed,
} from '../desk.errors.js'
import { toDeskLoan } from '../rules/desk-view.rules.js'

export async function registerPickup(librarianUid: string, loanId: string) {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const calendar = await readLibraryCalendar(settings.openingHours, at)
  const dueAt = addCalendarDaysToClosing(at, settings.loanDays, calendar)

  const updated = await getDb().runTransaction(async (tx) => {
    const loan = await loansRepository.findById(loanId, tx)
    if (!loan) throw deskLoanNotFound()
    if (loan.status !== LOAN_STATUS.awaitingPickup) throw pickupNotAllowed()
    if (loan.pickupDeadline.getTime() < at.getTime()) throw pickupExpired()

    const [student, book, copy, circulation, copies] = await Promise.all([
      usersRepository.findById(loan.studentUid, tx),
      booksRepository.findById(loan.bookId, tx),
      copiesRepository.findById(loan.copyId, tx),
      readStudentCirculation(loan.studentUid, tx),
      copiesRepository.listByBook(loan.bookId, tx),
    ])
    if (!student || !book || !copy) throw circulationInconsistent()
    if (
      copy.status !== COPY_STATUS.reserved ||
      copy.currentLoanId !== loan.id
    ) {
      throw circulationInconsistent()
    }
    if (hasOverdueLoan(circulation, at)) throw pickupBlockedByOverdue()

    const fields = {
      status: LOAN_STATUS.active,
      pickedUpAt: at,
      pickedUpBy: librarianUid,
      dueAt,
      updatedAt: at,
    }
    loansRepository.update(tx, loan.id, fields)
    copiesRepository.markOnLoan(tx, copy.id, loan.id, dueAt, at)
    booksRepository.update(tx, book.id, {
      nextReturnAt: nextReturnAtOf(copies, { copyId: copy.id, dueAt }),
      updatedAt: at,
    })
    notificationsRepository.create(
      tx,
      loan.studentUid,
      pickedUpNotice(loan, at),
    )
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.loanPickup,
        targetUid: loan.studentUid,
        bookId: loan.bookId,
        entityId: loan.id,
        details: { copyId: loan.copyId, dueAt: dueAt.toISOString() },
      },
      at,
    )
    return { ...loan, ...fields }
  })

  invalidateCatalogCache()
  return { loan: toDeskLoan(updated) }
}
