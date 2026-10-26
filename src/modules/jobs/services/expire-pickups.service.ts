import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { LOAN_STATUS } from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'
import { activeLoanCountAfter } from '../../loans/rules/loan-exit.rules.js'
import { pickupExpiredNotice } from '../../loans/rules/loan-notices.rules.js'
import {
  applyCopyRelease,
  planCopyRelease,
} from '../../loans/services/copy-release.service.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import type { LoanSettings } from '../../../shared/firestore/settings.js'

export async function expirePickups(
  at: Date,
  settings: Pick<LoanSettings, 'queueConfirmHours'>,
) {
  const expiredIds: string[] = []
  for (const id of await loansRepository.listPickupIdsExpiredBefore(at)) {
    const expired = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(id, tx)
      if (
        !loan ||
        loan.status !== LOAN_STATUS.awaitingPickup ||
        loan.pickupDeadline.getTime() >= at.getTime()
      ) {
        return false
      }
      const [student, book, copy] = await Promise.all([
        usersRepository.findById(loan.studentUid, tx),
        booksRepository.findById(loan.bookId, tx),
        copiesRepository.findById(loan.copyId, tx),
      ])
      if (!student || !book || !copy) {
        throw new Error(`Circulação inconsistente no pedido ${loan.id}.`)
      }
      const release = await planCopyRelease(tx, book, copy)
      applyCopyRelease(tx, release, at, settings)
      loansRepository.update(tx, loan.id, {
        status: LOAN_STATUS.expired,
        expiredAt: at,
        updatedAt: at,
      })
      usersRepository.setActiveLoanCount(
        tx,
        loan.studentUid,
        activeLoanCountAfter(student.activeLoanCount),
        at,
      )
      notificationsRepository.create(
        tx,
        loan.studentUid,
        pickupExpiredNotice(loan, at),
      )
      return true
    })
    if (expired) expiredIds.push(id)
  }
  if (expiredIds.length > 0) invalidateCatalogCache()
  return { processed: expiredIds.length, loanIds: expiredIds }
}
