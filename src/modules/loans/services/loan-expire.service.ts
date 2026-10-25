import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import { LOAN_STATUS } from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { pickupExpiredNotice } from '../../notifications/rules/loan-notices.rules.js'
import { isPickupExpired } from '../rules/expiration.rules.js'
import { applyCopyRelease, planCopyRelease } from './copy-release.service.js'

// Expira os pedidos não retirados (RF-EMP-06, rotina `expire_pickups`). QUEM CHAMA:
// a rota do Cloud Scheduler do módulo `jobs`, passando o "agora" das regras de
// negócio (shared/clock). Cada pedido aguardando retirada com o prazo vencido é
// tratado numa transação própria, um de cada vez: o pedido vira `expired`,
// `activeLoanCount` do aluno cai 1, o exemplar guardado passa ao 1º da fila ou
// volta para a estante (a mesma função do cancelamento) e o aluno recebe o aviso
// "Seu pedido expirou". Dentro da transação o pedido é conferido de novo, então
// rodar a rotina duas vezes, ou ao mesmo tempo que o aluno retira ou cancela, não
// repete nem desfaz nada. Devolve quantos pedidos expiraram.
export async function expirePickups(at: Date): Promise<number> {
  const settings = await readLoanSettings()
  const due = await loansRepository.listAwaitingPickupExpiredBefore(at)
  let expired = 0

  for (const { id } of due) {
    const done = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(id, tx)
      if (!loan || !isPickupExpired(loan, at)) return false

      const [student, book, copy] = await Promise.all([
        usersRepository.findById(loan.studentUid, tx),
        booksRepository.findById(loan.bookId, tx),
        copiesRepository.findById(loan.copyId, tx),
      ])
      if (!student || !book || !copy) {
        throw new Error('Aluno, livro ou exemplar do pedido não encontrado.')
      }
      const plan = await planCopyRelease(tx, book, copy)

      loansRepository.update(tx, loan.id, {
        status: LOAN_STATUS.expired,
        expiredAt: at,
        updatedAt: at,
      })
      usersRepository.setActiveLoanCount(
        tx,
        loan.studentUid,
        Math.max(0, student.activeLoanCount - 1),
        at,
      )
      applyCopyRelease(tx, plan, at, settings)
      notificationsRepository.create(
        tx,
        loan.studentUid,
        pickupExpiredNotice(loan, at),
      )
      return true
    })
    if (done) expired++
  }

  if (expired > 0) invalidateCatalogCache()
  return expired
}
