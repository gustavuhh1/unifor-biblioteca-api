import { randomBytes, randomInt } from 'node:crypto'
import { getDb } from '../../../config/firebase.js'
import { addBusinessDays } from '../../../shared/calendar/business-days.js'
import { nowOf } from '../../../shared/clock.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { forbidden } from '../../../shared/errors.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { checkRequestEligibility } from '../../../shared/rules/request-eligibility.js'
import {
  ELIGIBILITY_ACTION,
  USER_ROLE,
  USER_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import { noCopyAvailable, requestRefused } from '../loans.errors.js'
import type { CreateLoanBody, LoanResponse } from '../loans.types.js'
import * as loansRepository from '../repositories/loans.repository.js'
import { toLoanResponse } from '../rules/loan-view.rules.js'
import { buildNewLoan } from '../rules/new-loan.rules.js'
import {
  generatePickupCode,
  generateQrToken,
} from '../rules/pickup-code.rules.js'

// Solicita um empréstimo (RF-EMP-01 a RF-EMP-04, RF-EMP-07, RF-EMP-11). Numa
// transação, confere as regras da seção 2.9 e grava o pedido:
//   1. o usuário é um aluno ativo;
//   2. sem empréstimo atrasado (overdue);
//   3. menos de 10 pedidos e empréstimos (loan_limit);
//   4. nenhum pedido ou empréstimo do mesmo título, de qualquer edição (same_title);
//   5. livro ativo e não marcado como indisponível (unavailable);
//   6. existe exemplar disponível e a fila da edição está vazia (no_copy_available).
// Se passar: cria o pedido (aguardando retirada, com 2 dias úteis até o fechamento
// da biblioteca, código RET-#### e segredo do QR), o exemplar vira reserved,
// copiesAvailable do livro cai 1 e activeLoanCount do aluno sobe 1.
export async function requestLoan(
  uid: string,
  body: CreateLoanBody,
): Promise<LoanResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const calendar = await readLibraryCalendar(settings.openingHours, at)

  const loanId = loansRepository.newLoanId()
  const loan = await getDb().runTransaction(async (tx) => {
    const student = await usersRepository.findById(uid, tx)
    const book = await booksRepository.findById(body.bookId, tx)
    const circulation = await readStudentCirculation(uid, tx)
    const copy = book
      ? await copiesRepository.findAvailableByBook(book.id, tx)
      : undefined
    const takenCodes = await loansRepository.listAwaitingPickupCodes(tx)

    if (
      !student ||
      student.role !== USER_ROLE.student ||
      student.status !== USER_STATUS.active
    ) {
      throw forbidden()
    }
    if (!book) throw bookNotFound()

    const { allowed, blockedReason } = checkRequestEligibility({
      action: ELIGIBILITY_ACTION.request,
      book,
      student: circulation,
      limits: settings,
      at,
    })
    if (!allowed && blockedReason) throw requestRefused(blockedReason)
    if (!copy || book.queueLength > 0) throw noCopyAvailable()

    const newLoan = buildNewLoan({
      student: {
        uid,
        matricula: student.matricula,
        name: student.fullName ?? student.matricula,
      },
      book: {
        id: book.id,
        workId: book.workId,
        title: book.title,
        shelf: book.shelf,
      },
      copyId: copy.id,
      pickupCode: generatePickupCode(takenCodes, randomInt),
      qrToken: generateQrToken(randomBytes),
      loanDays: settings.loanDays,
      pickupDeadline: addBusinessDays(
        at,
        settings.pickupBusinessDays,
        calendar,
      ),
      at,
    })

    loansRepository.create(tx, loanId, newLoan)
    copiesRepository.reserve(tx, copy.id, loanId, at)
    booksRepository.update(tx, book.id, {
      copiesAvailable: book.copiesAvailable - 1,
      updatedAt: at,
    })
    usersRepository.setActiveLoanCount(
      tx,
      uid,
      circulation.activeLoanCount + 1,
      at,
    )
    return newLoan
  })

  invalidateCatalogCache()
  return toLoanResponse(
    { id: loanId, ...loan },
    { at, dueSoonDays: settings.dueSoonDays, renewalDenial: null },
  )
}
