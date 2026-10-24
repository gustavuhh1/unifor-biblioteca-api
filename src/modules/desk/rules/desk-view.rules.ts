import { isoOrNull } from '../../../shared/iso-date.js'
import { displayNameOf } from '../../../shared/domain/user.js'
import { isOverdue } from '../../../shared/time.js'
import {
  BLOCKED_REASON,
  LOAN_STATUS,
  type DateOnly,
  type LoanRecord,
  type User,
} from '../../../shared/types/index.js'
import { calculateFine } from '../../fines/rules/fine-amount.rules.js'
import {
  displayStateOf,
  progressOf,
} from '../../loans/rules/loan-view.rules.js'
import type { DeskLoan, DeskLookupResponse } from '../desk.types.js'

// Como a ficha do balcão mostra o aluno e os pedidos dele (RF-BAL-02). Funções
// puras: o estado, o progresso e a multa prevista são calculados a partir de `at`,
// e nenhuma resposta leva o qrToken.

// O que as funções precisam saber do momento e das regras.
export interface DeskViewContext {
  at: Date
  dueSoonDays: number
  // Valor da multa por dia útil de atraso, em centavos (RF-MUL-01).
  fineCentsPerBusinessDay: number
  // Feriados e recessos: dias que não contam como atraso.
  closedDates: ReadonlySet<DateOnly>
  // Limite de livros ao mesmo tempo ("3 de 10").
  maxActiveLoans: number
}

// O pedido ou empréstimo como o balcão o mostra. O código curto só sai enquanto o
// pedido espera a retirada.
export function toDeskLoan(
  loan: LoanRecord,
  context: Pick<DeskViewContext, 'at' | 'dueSoonDays'>,
): DeskLoan {
  const { at, dueSoonDays } = context
  return {
    id: loan.id,
    bookId: loan.bookId,
    bookTitle: loan.bookTitle,
    bookShelf: loan.bookShelf,
    status: loan.status,
    state: displayStateOf(loan, at, dueSoonDays),
    pickupCode:
      loan.status === LOAN_STATUS.awaitingPickup ? loan.pickupCode : null,
    pickupDeadline: loan.pickupDeadline.toISOString(),
    pickedUpAt: isoOrNull(loan.pickedUpAt),
    dueAt: isoOrNull(loan.dueAt),
    returnedAt: isoOrNull(loan.returnedAt),
    progress: progressOf(loan, at),
  }
}

// A multa que um empréstimo atrasado já acumulou (RF-MUL-01). Devolve null se o
// empréstimo não está atrasado ou se ainda não passou um dia útil, porque a
// devolução só gera multa com pelo menos um dia útil de atraso.
export function finePreviewOf(
  loan: Pick<LoanRecord, 'status' | 'dueAt'>,
  context: Pick<
    DeskViewContext,
    'at' | 'fineCentsPerBusinessDay' | 'closedDates'
  >,
): { businessDaysLate: number; amountCents: number } | null {
  if (
    loan.status !== LOAN_STATUS.active ||
    !loan.dueAt ||
    !isOverdue(loan.dueAt, context.at)
  ) {
    return null
  }
  const { businessDaysLate, amountCents } = calculateFine({
    dueAt: loan.dueAt,
    until: context.at,
    ratePerBusinessDayCents: context.fineCentsPerBusinessDay,
    closedDates: context.closedDates,
  })
  return businessDaysLate > 0 ? { businessDaysLate, amountCents } : null
}

// Algum empréstimo ativo do aluno está atrasado: a retirada fica bloqueada
// (RF-EMP-04).
export function hasOverdueActive(
  loans: readonly Pick<LoanRecord, 'status' | 'dueAt'>[],
  at: Date,
): boolean {
  return loans.some(
    (loan) =>
      loan.status === LOAN_STATUS.active &&
      loan.dueAt !== undefined &&
      isOverdue(loan.dueAt, at),
  )
}

// Monta a ficha do aluno (RF-BAL-02, RF-BAL-03) a partir do aluno e de todos os
// pedidos dele. `scannedLoanId` é o pedido que o QR ou o código apontou (nenhum na
// busca por matrícula). Os pedidos para retirar saem do prazo mais curto ao mais
// longo; os livros com o aluno, do vencimento mais próximo ao mais distante.
export function toLookupResponse(input: {
  uid: string
  student: User
  loans: readonly LoanRecord[]
  scannedLoanId: string | undefined
  context: DeskViewContext
}): DeskLookupResponse {
  const { uid, student, loans, scannedLoanId, context } = input
  const byTime = (date: Date | undefined) => date?.getTime() ?? 0

  const pickups = loans
    .filter((loan) => loan.status === LOAN_STATUS.awaitingPickup)
    .sort((a, b) => byTime(a.pickupDeadline) - byTime(b.pickupDeadline))
    .map((loan) => ({
      ...toDeskLoan(loan, context),
      scanned: loan.id === scannedLoanId,
    }))
  const withStudent = loans
    .filter((loan) => loan.status === LOAN_STATUS.active)
    .sort((a, b) => byTime(a.dueAt) - byTime(b.dueAt))
    .map((loan) => ({
      ...toDeskLoan(loan, context),
      fine: finePreviewOf(loan, context),
    }))

  return {
    student: {
      uid,
      matricula: student.matricula,
      name: displayNameOf(student),
      initials: student.initials ?? null,
      activeLoanCount: student.activeLoanCount,
      maxActiveLoans: context.maxActiveLoans,
      openFineTotalCents: student.openFineTotalCents,
    },
    pickups,
    withStudent,
    blockedReason: hasOverdueActive(loans, context.at)
      ? BLOCKED_REASON.overdue
      : null,
  }
}
