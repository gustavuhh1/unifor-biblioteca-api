import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  FINE_STATUS,
  LOAN_STATUS,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { DELETE_FIELD } from '../../catalog/rules/book-update.rules.js'
import { fineReceiverOf } from '../../fines/rules/fine-amount.rules.js'
import { onCopyReturned } from '../../loans/services/copy-returned.service.js'
import { loanNotFound } from '../../loans/loans.errors.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import {
  fineOpenNotice,
  finePaidNotice,
  returnConfirmedNotice,
} from '../../notifications/rules/loan-notices.rules.js'
import { nextReturnAtOf } from '../../loans/rules/renewal.rules.js'
import { loanNotReturnable } from '../desk.errors.js'
import type { ReturnLoanBody, ReturnResponse } from '../desk.types.js'
import { toDeskLoan } from '../rules/desk-view.rules.js'
import { booksReadAfterReturn, returnFields } from '../rules/return.rules.js'

// Registra a devolução de um livro no balcão (RF-BAL-04, RF-BAL-08). Só vale para
// empréstimo ativo (senão 409). Numa transação, depois de todas as leituras:
// `onCopyReturned` congela a multa (ou a fecha como paga, com "Multa paga agora")
// e passa o exemplar ao 1º da fila, que é avisado na hora, ou o devolve à estante;
// o empréstimo vira `returned`, `activeLoanCount` do aluno cai 1,
// `booksReadByYear` sobe 1, `books.nextReturnAt` volta a ser o menor vencimento
// dos exemplares que seguem emprestados e o auditLog registra `loan_return`.
export async function registerReturn(
  librarianUid: string,
  loanId: string,
  body: ReturnLoanBody,
): Promise<ReturnResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const calendar = await readLibraryCalendar(settings.openingHours, at)

  const result = await getDb().runTransaction(async (tx) => {
    const loan = await loansRepository.findById(loanId, tx)
    if (!loan) throw loanNotFound()
    if (loan.status !== LOAN_STATUS.active) throw loanNotReturnable()

    const [student, librarian, book, copy, copies] = await Promise.all([
      usersRepository.findById(loan.studentUid, tx),
      usersRepository.findById(librarianUid, tx),
      booksRepository.findById(loan.bookId, tx),
      copiesRepository.findById(loan.copyId, tx),
      copiesRepository.listByBook(loan.bookId, tx),
    ])
    if (!student || !librarian || !book || !copy) {
      throw new Error(
        'Aluno, bibliotecário, livro ou exemplar do empréstimo não encontrado.',
      )
    }

    // Lê a multa e o 1º da fila e grava a multa e o exemplar; por isso vem depois
    // das leituras acima e antes das gravações abaixo.
    const returned = await onCopyReturned(
      tx,
      {
        loan,
        student: { ...student, uid: loan.studentUid },
        book,
        copy,
        paidNow: body.finePaidNow
          ? fineReceiverOf(librarianUid, librarian)
          : undefined,
        calendar,
        settings,
      },
      at,
    )

    const fields = returnFields({ librarianUid, at })
    loansRepository.update(tx, loan.id, fields)
    usersRepository.setActiveLoanCount(
      tx,
      loan.studentUid,
      Math.max(0, student.activeLoanCount - 1),
      at,
    )
    usersRepository.setBooksReadByYear(
      tx,
      loan.studentUid,
      booksReadAfterReturn(student.booksReadByYear, at),
      at,
    )
    booksRepository.update(tx, book.id, {
      nextReturnAt:
        nextReturnAtOf(copies, { copyId: copy.id, dueAt: undefined }) ??
        DELETE_FIELD,
      updatedAt: at,
    })
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
          ...(returned.fine ? { fineId: returned.fine.id } : {}),
          fineCents: returned.fine?.amountCents ?? 0,
          finePaidNow: returned.fine?.status === FINE_STATUS.paid,
          queueNotified: returned.turnStartedFor !== undefined,
        },
      },
      at,
    )
    notificationsRepository.create(
      tx,
      loan.studentUid,
      returnConfirmedNotice(loan, at),
    )
    if (returned.fine) {
      const fine = {
        ...returned.fine,
        loanId: loan.id,
        bookId: loan.bookId,
        bookTitle: loan.bookTitle,
      }
      notificationsRepository.create(
        tx,
        loan.studentUid,
        fine.status === FINE_STATUS.paid
          ? finePaidNotice(fine, at)
          : fineOpenNotice(fine, at),
      )
    }
    return { loan: { ...loan, ...fields }, returned }
  })

  invalidateCatalogCache()
  return {
    loan: toDeskLoan(result.loan, { at, dueSoonDays: settings.dueSoonDays }),
    fine: result.returned.fine ?? null,
    queueNotified: result.returned.turnStartedFor !== undefined,
  }
}
