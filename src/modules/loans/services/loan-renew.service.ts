import { getDb } from '../../../config/firebase.js'
import { addCalendarDaysToClosing } from '../../../shared/calendar/business-days.js'
import { nowOf } from '../../../shared/clock.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { LOAN_STATUS } from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import { loanNotActive, loanNotFound, renewalDenied } from '../loans.errors.js'
import type { LoanResponse } from '../loans.types.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { renewalDoneNotice } from '../../notifications/rules/loan-notices.rules.js'
import { toLoanResponse } from '../rules/loan-view.rules.js'
import {
  nextReturnAtOf,
  renewalDenialOf,
  renewalUpdate,
} from '../rules/renewal.rules.js'

// Renova um empréstimo uma única vez (RF-EMP-09, RF-EMP-10, RF-EMP-11). Só o dono do
// empréstimo (outro aluno recebe 404) e só se estiver ativo (senão 409). É negada,
// com o motivo no code, se estiver atrasada (overdue), se o livro tem fila
// (has_queue) ou se a renovação já foi usada (already_renewed). Se passar, numa
// transação: originalDueAt guarda o vencimento antigo, dueAt soma 14 dias com a
// mesma regra de ajuste do vencimento (fechamento, próximo dia aberto),
// renewalCount sobe para 1, o exemplar recebe o novo dueAt e books.nextReturnAt
// acompanha o menor vencimento dos exemplares emprestados.
export async function renewLoan(
  uid: string,
  loanId: string,
): Promise<LoanResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const calendar = await readLibraryCalendar(settings.openingHours, at)

  const renewed = await getDb().runTransaction(async (tx) => {
    const loan = await loansRepository.findById(loanId, tx)
    if (!loan || loan.studentUid !== uid) throw loanNotFound()
    if (loan.status !== LOAN_STATUS.active || !loan.dueAt) {
      throw loanNotActive()
    }

    const book = await booksRepository.findById(loan.bookId, tx)
    const copies = await copiesRepository.listByBook(loan.bookId, tx)
    if (!book) throw new Error('Livro do empréstimo não encontrado.')

    const denial = renewalDenialOf({
      loan,
      book,
      maxRenewals: settings.maxRenewals,
      at,
    })
    if (denial) throw renewalDenied(denial)

    const newDueAt = addCalendarDaysToClosing(
      loan.dueAt,
      settings.renewalDays,
      calendar,
    )
    const update = renewalUpdate(loan, newDueAt, at)
    const nextReturnAt = nextReturnAtOf(copies, {
      copyId: loan.copyId,
      dueAt: newDueAt,
    })

    loansRepository.update(tx, loan.id, update)
    copiesRepository.setDueAt(tx, loan.copyId, newDueAt, at)
    booksRepository.update(tx, book.id, { nextReturnAt, updatedAt: at })
    const updated = { ...loan, ...update }
    notificationsRepository.create(
      tx,
      uid,
      renewalDoneNotice({ ...loan, dueAt: newDueAt }, at),
    )
    // Depois de renovar, o que impede outra renovação é a contagem (already_renewed).
    const renewalDenial = renewalDenialOf({
      loan: updated,
      book,
      maxRenewals: settings.maxRenewals,
      at,
    })
    return { updated, renewalDenial }
  })

  invalidateCatalogCache()
  return toLoanResponse(renewed.updated, {
    at,
    dueSoonDays: settings.dueSoonDays,
    renewalDenial: renewed.renewalDenial,
  })
}
