import { randomBytes, randomInt } from 'node:crypto'
import { getDb } from '../../../config/firebase.js'
import { addBusinessDays } from '../../../shared/calendar/business-days.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { displayNameOf } from '../../../shared/domain/user.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { checkRequestEligibility } from '../../../shared/rules/request-eligibility.js'
import {
  ELIGIBILITY_ACTION,
  LOAN_ORIGIN,
  QUEUE_ENTRY_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import { requestRefused } from '../../loans/loans.errors.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import { toLoanResponse } from '../../loans/rules/loan-view.rules.js'
import { buildNewLoan } from '../../loans/rules/new-loan.rules.js'
import {
  generatePickupCode,
  generateQrToken,
} from '../../loans/rules/pickup-code.rules.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { pickupReadyNotice } from '../../notifications/rules/loan-notices.rules.js'
import { confirmDenied, queueEntryNotFound } from '../queues.errors.js'
import type { ConfirmTurnResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import {
  activeQueueCountAfter,
  fulfilledFields,
} from '../rules/queue-exit.rules.js'
import { otherEditionNotice } from '../rules/queue-notices.rules.js'
import { confirmDenialOf } from '../rules/turn.rules.js'
import { applyQueueExit, planQueueExit } from './queue-exit.service.js'

// O aluno confirma a vez (RF-FIL-06, RF-FIL-04). Só o dono do lugar (outro aluno
// recebe 404). Recusa, com o motivo no code: o lugar já saiu da fila
// (queue_entry_not_active), ainda está esperando (not_your_turn) ou passou das 24h
// (turn_expired). Valem as regras do pedido: sem empréstimo atrasado, abaixo do
// limite de 10 e sem outro pedido do mesmo título; a marca "indisponível para
// novos pedidos" não vale para a vez que já existia. Numa transação: nasce o pedido
// (`origin: queue`, aguardando retirada, com 2 dias úteis até o fechamento) com o
// exemplar que estava guardado; o lugar vira `fulfilled`; `queueLength` do livro cai
// 1; `activeLoanCount` do aluno sobe 1 e `activeQueueCount` cai 1. Os lugares das
// outras edições marcadas juntas viram `cancelled_other_edition`, com aviso, e
// liberam as suas vagas das 7 filas.
export async function confirmTurn(
  uid: string,
  entryId: string,
): Promise<ConfirmTurnResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const calendar = await readLibraryCalendar(settings.openingHours, at)
  const loanId = loansRepository.newLoanId()

  const result = await getDb().runTransaction(async (tx) => {
    const entry = await queueEntriesRepository.findById(entryId, tx)
    if (!entry || entry.studentUid !== uid) throw queueEntryNotFound()
    const denial = confirmDenialOf(entry, at)
    if (denial) throw confirmDenied(denial)
    if (!entry.reservedCopyId) {
      throw new Error('A vez na fila não tem exemplar guardado.')
    }

    const [student, book, circulation, takenCodes, group] = await Promise.all([
      usersRepository.findById(uid, tx),
      booksRepository.findById(entry.bookId, tx),
      readStudentCirculation(uid, tx),
      loansRepository.listAwaitingPickupCodes(tx),
      entry.editionGroupId
        ? queueEntriesRepository.listActiveByGroup(entry.editionGroupId, tx)
        : Promise.resolve([]),
    ])
    if (!student || !book) {
      throw new Error('Aluno ou livro do lugar na fila não encontrado.')
    }
    const others = group.filter((other) => other.id !== entry.id)
    const exits = await Promise.all(
      others.map((other) => planQueueExit(tx, other)),
    )

    const { allowed, blockedReason } = checkRequestEligibility({
      action: ELIGIBILITY_ACTION.request,
      book: { ...book, unavailableForNewRequests: false },
      student: circulation,
      limits: settings,
      at,
    })
    if (!allowed && blockedReason) throw requestRefused(blockedReason)

    const newLoan = buildNewLoan({
      student: {
        uid,
        matricula: student.matricula,
        name: displayNameOf(student),
      },
      book: {
        id: book.id,
        workId: book.workId,
        title: book.title,
        shelf: book.shelf,
      },
      copyId: entry.reservedCopyId,
      pickupCode: generatePickupCode(takenCodes, randomInt),
      qrToken: generateQrToken(randomBytes),
      loanDays: settings.loanDays,
      pickupDeadline: addBusinessDays(
        at,
        settings.pickupBusinessDays,
        calendar,
      ),
      origin: LOAN_ORIGIN.queue,
      queueEntryId: entry.id,
      at,
    })

    loansRepository.create(tx, loanId, newLoan)
    copiesRepository.reserve(tx, entry.reservedCopyId, loanId, at)
    notificationsRepository.create(
      tx,
      uid,
      pickupReadyNotice({ id: loanId, ...newLoan }, at),
    )
    queueEntriesRepository.update(tx, entry.id, fulfilledFields(loanId, at))
    booksRepository.update(tx, book.id, {
      queueLength: Math.max(0, book.queueLength - 1),
      updatedAt: at,
    })
    for (const exit of exits) {
      applyQueueExit(
        tx,
        exit,
        { status: QUEUE_ENTRY_STATUS.cancelledOtherEdition },
        at,
        settings,
      )
      notificationsRepository.create(
        tx,
        exit.entry.studentUid,
        otherEditionNotice(exit.entry, at),
      )
    }
    usersRepository.setActiveLoanCount(
      tx,
      uid,
      circulation.activeLoanCount + 1,
      at,
    )
    usersRepository.setActiveQueueCount(
      tx,
      uid,
      activeQueueCountAfter(circulation.activeQueueCount, 1 + others.length),
      at,
    )
    return { newLoan, cancelledEntryIds: others.map((other) => other.id) }
  })

  invalidateCatalogCache()
  return {
    loan: toLoanResponse(
      { id: loanId, ...result.newLoan },
      { at, dueSoonDays: settings.dueSoonDays, renewalDenial: null },
    ),
    cancelledEntryIds: result.cancelledEntryIds,
  }
}
