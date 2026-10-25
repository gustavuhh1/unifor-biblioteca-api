import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { addCalendarDaysToClosing } from '../../../shared/calendar/business-days.js'
import { nowOf } from '../../../shared/clock.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  COPY_STATUS,
  LOAN_STATUS,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import { loanNotFound } from '../../loans/loans.errors.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { pickedUpNotice } from '../../notifications/rules/loan-notices.rules.js'
import { nextReturnAtOf } from '../../loans/rules/renewal.rules.js'
import {
  loanNotAwaitingPickup,
  pickupExpired,
  studentOverdue,
} from '../desk.errors.js'
import type { PickupResponse } from '../desk.types.js'
import { pickupDenialOf, pickupFields } from '../rules/pickup.rules.js'
import { toDeskLoan } from '../rules/desk-view.rules.js'

// Registra a retirada de um pedido no balcão (RF-BAL-02): o aluno leva o exemplar e
// o empréstimo de 14 dias começa a contar. Recusada se o pedido não está mais
// aguardando (409), se o prazo de retirada passou (`pickup_expired`) ou se o aluno
// tem livro atrasado (`overdue`, RF-EMP-04). Numa transação: o pedido vira
// `active` (`pickedUpAt`, `pickedUpBy`, `dueAt` no fechamento, e se cair em
// domingo, feriado ou recesso, no próximo dia aberto), o exemplar vira `on_loan`
// com o vencimento, `books.nextReturnAt` acompanha o menor vencimento e o auditLog
// registra `loan_pickup`. O contador de livros do aluno não muda: o pedido já
// contava nos 10.
export async function registerPickup(
  librarianUid: string,
  loanId: string,
): Promise<PickupResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const calendar = await readLibraryCalendar(settings.openingHours, at)

  const picked = await getDb().runTransaction(async (tx) => {
    const loan = await loansRepository.findById(loanId, tx)
    if (!loan) throw loanNotFound()
    if (loan.status !== LOAN_STATUS.awaitingPickup) {
      throw loanNotAwaitingPickup(loan.status)
    }

    const [student, book, copy, copies] = await Promise.all([
      readStudentCirculation(loan.studentUid, tx),
      booksRepository.findById(loan.bookId, tx),
      copiesRepository.findById(loan.copyId, tx),
      copiesRepository.listByBook(loan.bookId, tx),
    ])
    if (!book || !copy || copy.status !== COPY_STATUS.reserved) {
      throw new Error('Livro ou exemplar do pedido em estado inesperado.')
    }

    const denial = pickupDenialOf({ loan, student, at })
    if (denial === 'expired') throw pickupExpired()
    if (denial === 'overdue') throw studentOverdue()

    const dueAt = addCalendarDaysToClosing(at, loan.loanDays, calendar)
    const fields = pickupFields({ librarianUid, dueAt, at })

    loansRepository.update(tx, loan.id, fields)
    copiesRepository.markOnLoan(tx, copy.id, dueAt, at)
    booksRepository.update(tx, book.id, {
      nextReturnAt: nextReturnAtOf(copies, { copyId: copy.id, dueAt }),
      updatedAt: at,
    })
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.loanPickup,
        targetUid: loan.studentUid,
        bookId: loan.bookId,
        entityId: loan.id,
        details: { copyId: copy.id, dueAt },
      },
      at,
    )
    notificationsRepository.create(
      tx,
      loan.studentUid,
      pickedUpNotice({ ...loan, dueAt }, at),
    )
    return { ...loan, ...fields }
  })

  invalidateCatalogCache()
  return { loan: toDeskLoan(picked, { at, dueSoonDays: settings.dueSoonDays }) }
}
