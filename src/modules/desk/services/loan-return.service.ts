import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { localDate } from '../../../shared/calendar/dates.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { displayNameOf } from '../../../shared/domain/user.js'
import { readLibraryCalendarBetween } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  COPY_STATUS,
  LOAN_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import { DELETE_FIELD } from '../../catalog/rules/book-update.rules.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'
import { activeLoanCountAfter } from '../../loans/rules/loan-exit.rules.js'
import {
  fineNotice,
  returnedNotice,
} from '../../loans/rules/loan-notices.rules.js'
import { nextReturnAtOf } from '../../loans/rules/renewal.rules.js'
import { onCopyReturned } from '../../loans/services/copy-returned.service.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import {
  circulationInconsistent,
  deskLoanNotFound,
  returnNotAllowed,
} from '../desk.errors.js'
import { toDeskLoan } from '../rules/desk-view.rules.js'

export async function registerReturn(
  librarianUid: string,
  loanId: string,
  paidNow: boolean,
) {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const loanBefore = await loansRepository.findById(loanId)
  if (!loanBefore) throw deskLoanNotFound()
  const calendar = await readLibraryCalendarBetween(
    settings.openingHours,
    loanBefore.dueAt ?? at,
    at,
  )

  const result = await getDb().runTransaction(async (tx) => {
    const loan = await loansRepository.findById(loanId, tx)
    if (!loan) throw deskLoanNotFound()
    if (loan.status !== LOAN_STATUS.active) throw returnNotAllowed()

    const [student, librarian, book, copy, copies] = await Promise.all([
      usersRepository.findById(loan.studentUid, tx),
      usersRepository.findById(librarianUid, tx),
      booksRepository.findById(loan.bookId, tx),
      copiesRepository.findById(loan.copyId, tx),
      copiesRepository.listByBook(loan.bookId, tx),
    ])
    if (!student || !librarian || !book || !copy) {
      throw circulationInconsistent()
    }
    if (copy.status !== COPY_STATUS.onLoan || copy.currentLoanId !== loan.id) {
      throw circulationInconsistent()
    }

    const returned = await onCopyReturned(
      tx,
      {
        loan,
        student: { ...student, uid: loan.studentUid },
        book,
        copy,
        calendar,
        settings,
        paidNow: paidNow
          ? { uid: librarianUid, name: displayNameOf(librarian) }
          : undefined,
      },
      at,
    )
    const fields = {
      status: LOAN_STATUS.returned,
      returnedAt: at,
      returnedTo: librarianUid,
      updatedAt: at,
    }
    loansRepository.update(tx, loan.id, fields)
    const year = Number(localDate(at).slice(0, 4))
    usersRepository.recordReturnedBook(
      tx,
      loan.studentUid,
      {
        activeLoanCount: activeLoanCountAfter(student.activeLoanCount),
        year,
        currentYearCount: student.booksReadByYear?.[String(year)] ?? 0,
      },
      at,
    )
    booksRepository.update(tx, book.id, {
      nextReturnAt: nextReturnAtOf(copies, { copyId: copy.id }) ?? DELETE_FIELD,
      updatedAt: at,
    })
    notificationsRepository.create(
      tx,
      loan.studentUid,
      returnedNotice(loan, at),
    )
    if (returned.fine) {
      notificationsRepository.create(
        tx,
        loan.studentUid,
        fineNotice(loan, returned.fine, at),
      )
    }
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.loanReturn,
        targetUid: loan.studentUid,
        bookId: loan.bookId,
        entityId: loan.id,
        details: {
          copyId: loan.copyId,
          paidNow,
          fineId: returned.fine?.id,
          amountCents: returned.fine?.amountCents,
        },
      },
      at,
    )
    if (returned.fine?.status === 'paid') {
      writeAuditLog(
        tx,
        {
          actorUid: librarianUid,
          actorRole: AUDIT_ACTOR_ROLE.librarian,
          action: AUDIT_ACTION.finePaid,
          targetUid: loan.studentUid,
          bookId: loan.bookId,
          entityId: returned.fine.id,
          details: {
            loanId: loan.id,
            amountCents: returned.fine.amountCents,
            paidAtReturn: true,
          },
        },
        at,
      )
    }
    return { loan: { ...loan, ...fields }, ...returned }
  })

  invalidateCatalogCache()
  return {
    loan: toDeskLoan(result.loan),
    fine: result.fine ?? null,
    turnStartedFor: result.turnStartedFor ?? null,
  }
}
