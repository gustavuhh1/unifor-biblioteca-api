import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { LOAN_STATUS, type BookRecord } from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import type { LoanView, MyLoansResponse } from '../loans.types.js'
import * as loansRepository from '../repositories/loans.repository.js'
import { belongsToView, toLoanResponse } from '../rules/loan-view.rules.js'
import { renewalDenialOf } from '../rules/renewal.rules.js'

// Meus empréstimos (RF-EMP-08, RF-SIS-03). `active` traz os pedidos para retirar e os
// empréstimos ativos; `history`, os devolvidos, expirados e cancelados, dos mais
// novos para os mais antigos. Cada item sai com o estado calculado na hora (Pronto
// para retirar, Em andamento, Vence em breve, Atrasado), o progresso do prazo e, nos
// ativos, se a renovação é possível agora ou o motivo de não ser (RF-EMP-10).
export async function listMyLoans(
  uid: string,
  view: LoanView,
): Promise<MyLoansResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const loans = (await loansRepository.listByStudent(uid)).filter((loan) =>
    belongsToView(loan, view),
  )

  // A renovação depende da fila do livro: lê cada livro dos empréstimos ativos uma vez.
  const activeBookIds = [
    ...new Set(
      loans
        .filter((loan) => loan.status === LOAN_STATUS.active)
        .map((loan) => loan.bookId),
    ),
  ]
  const books = new Map<string, BookRecord>()
  for (const book of await Promise.all(
    activeBookIds.map((id) => booksRepository.findById(id)),
  )) {
    if (book) books.set(book.id, book)
  }

  return {
    view,
    items: loans.map((loan) => {
      const book = books.get(loan.bookId)
      const renewalDenial =
        loan.status === LOAN_STATUS.active && book
          ? renewalDenialOf({
              loan,
              book,
              maxRenewals: settings.maxRenewals,
              at,
            })
          : null
      return toLoanResponse(loan, {
        at,
        dueSoonDays: settings.dueSoonDays,
        renewalDenial,
      })
    }),
  }
}
