import { getDb } from '../../../config/firebase.js'
import { nowOf } from '../../../shared/clock.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { LOAN_STATUS } from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import { loanNotCancellable, loanNotFound } from '../loans.errors.js'
import type { LoanResponse } from '../loans.types.js'
import * as loansRepository from '../repositories/loans.repository.js'
import { toLoanResponse } from '../rules/loan-view.rules.js'
import { applyCopyRelease, planCopyRelease } from './copy-release.service.js'

// Cancela um pedido antes da retirada (RF-EMP-05). Só o dono do pedido (outro aluno
// recebe 404) e só enquanto aguarda a retirada (senão 409). Numa transação: o pedido
// vira cancelled, activeLoanCount do aluno cai 1 e o exemplar volta (função única
// de copy-release.service: o 1º da fila, se houver, ou a estante).
export async function cancelLoan(
  uid: string,
  loanId: string,
): Promise<LoanResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const cancelled = await getDb().runTransaction(async (tx) => {
    const loan = await loansRepository.findById(loanId, tx)
    if (!loan || loan.studentUid !== uid) throw loanNotFound()
    if (loan.status !== LOAN_STATUS.awaitingPickup) throw loanNotCancellable()

    const [student, book, copy] = await Promise.all([
      usersRepository.findById(uid, tx),
      booksRepository.findById(loan.bookId, tx),
      copiesRepository.findById(loan.copyId, tx),
    ])
    if (!student || !book || !copy) {
      throw new Error('Aluno, livro ou exemplar do pedido não encontrado.')
    }
    const plan = await planCopyRelease(tx, book, copy)

    const update = {
      status: LOAN_STATUS.cancelled,
      cancelledAt: at,
      updatedAt: at,
    }
    loansRepository.update(tx, loan.id, update)
    usersRepository.setActiveLoanCount(
      tx,
      uid,
      Math.max(0, student.activeLoanCount - 1),
      at,
    )
    applyCopyRelease(tx, plan, at, settings)
    return { ...loan, ...update }
  })

  invalidateCatalogCache()
  return toLoanResponse(cancelled, {
    at,
    dueSoonDays: settings.dueSoonDays,
    renewalDenial: null,
  })
}
