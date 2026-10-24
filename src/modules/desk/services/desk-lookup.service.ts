import { nowOf } from '../../../shared/clock.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import {
  LOAN_STATUS,
  USER_ROLE,
  USER_STATUS,
  type LoanRecord,
} from '../../../shared/types/index.js'
import { loanNotFound } from '../../loans/loans.errors.js'
import { loanNotAwaitingPickup, studentNotFound } from '../desk.errors.js'
import type { DeskLookupBody, DeskLookupResponse } from '../desk.types.js'
import { toLookupResponse } from '../rules/desk-view.rules.js'

// Acha o pedido que o QR ou o código apontou. O QR vale para o pedido de que saiu:
// se ele não está mais aguardando a retirada, o balcão é avisado (409). O código
// curto só existe entre os pedidos aguardando retirada, então um código que não
// acha pedido é "pedido não encontrado" (404).
async function findScannedLoan(
  body: DeskLookupBody,
): Promise<LoanRecord | undefined> {
  if (body.qrToken !== undefined) {
    const loan = await loansRepository.findByQrToken(body.qrToken)
    if (!loan) throw loanNotFound()
    if (loan.status !== LOAN_STATUS.awaitingPickup) {
      throw loanNotAwaitingPickup(loan.status)
    }
    return loan
  }
  if (body.pickupCode !== undefined) {
    const loan = await loansRepository.findAwaitingByPickupCode(
      body.pickupCode.toUpperCase(),
    )
    if (!loan) throw loanNotFound()
    return loan
  }
  return undefined
}

// Ficha do aluno no balcão (RF-BAL-02, RF-BAL-03): o aluno vem do QR, do código do
// pedido ou da matrícula. Devolve o aluno, os pedidos aguardando retirada, os
// livros que estão com ele (com a multa já acumulada dos atrasados) e se o atraso
// bloqueia a retirada. Só leitura.
export async function lookupStudent(
  body: DeskLookupBody,
): Promise<DeskLookupResponse> {
  const scanned = await findScannedLoan(body)
  const uid =
    scanned?.studentUid ??
    (body.matricula
      ? await usersRepository.findUidByMatricula(body.matricula)
      : undefined)
  const student = uid ? await usersRepository.findById(uid) : undefined
  // Matrícula inexistente, de bibliotecário ou de cadastro não confirmado: a
  // mesma resposta.
  if (
    !uid ||
    !student ||
    student.role !== USER_ROLE.student ||
    student.status !== USER_STATUS.active
  ) {
    throw studentNotFound()
  }

  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const [calendar, loans] = await Promise.all([
    readLibraryCalendar(settings.openingHours, at),
    loansRepository.listByStudent(uid),
  ])

  return toLookupResponse({
    uid,
    student,
    loans,
    scannedLoanId: scanned?.id,
    context: {
      at,
      dueSoonDays: settings.dueSoonDays,
      fineCentsPerBusinessDay: settings.fineCentsPerBusinessDay,
      closedDates: calendar.closedDates,
      maxActiveLoans: settings.maxActiveLoans,
    },
  })
}
