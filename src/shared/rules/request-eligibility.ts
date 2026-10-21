import {
  BLOCKED_REASON,
  BOOK_STATUS,
  ELIGIBILITY_ACTION,
  LOAN_STATUS,
  type BlockedReason,
  type BookStatus,
  type EligibilityAction,
  type LoanStatus,
} from '../types/index.js'
import { isOverdue } from '../time.js'

// Limites de settings/library que a regra usa (RF-EMP-02, RF-FIL-03).
export interface RequestLimits {
  maxActiveLoans: number
  maxActiveQueues: number
}

// Valores de settings/library (maxActiveLoans e maxActiveQueues), usados quando
// esse documento não existe.
export const DEFAULT_REQUEST_LIMITS: RequestLimits = {
  maxActiveLoans: 10,
  maxActiveQueues: 7,
}

// O que a regra precisa saber do livro.
export interface EligibilityBook {
  workId: string
  status: BookStatus
  unavailableForNewRequests: boolean
  copiesAvailable: number
}

// Um pedido aguardando retirada ou um empréstimo ativo do aluno.
export interface StudentOpenLoan {
  workId: string
  status: LoanStatus
  dueAt?: Date | undefined
}

// O que a regra precisa saber do aluno: os contadores de users e os seus
// pedidos e empréstimos em andamento.
export interface StudentCirculation {
  activeLoanCount: number
  activeQueueCount: number
  openLoans: readonly StudentOpenLoan[]
}

// Resultado da regra: pode seguir, ou o motivo de estar bloqueado.
export interface EligibilityResult {
  allowed: boolean
  blockedReason?: BlockedReason
}

const ALLOWED: EligibilityResult = { allowed: true }
const blocked = (blockedReason: BlockedReason): EligibilityResult => ({
  allowed: false,
  blockedReason,
})

// O que a página do livro sugere: pedir o empréstimo quando há exemplar
// disponível; entrar na fila quando não há (RF-ACE-02).
export function suggestedActionOf(
  book: Pick<EligibilityBook, 'copiesAvailable'>,
): EligibilityAction {
  return book.copiesAvailable > 0
    ? ELIGIBILITY_ACTION.request
    : ELIGIBILITY_ACTION.joinQueue
}

// Livro removido ou marcado como indisponível para novos pedidos (RF-ACE-08,
// RF-GAC-06).
const isUnavailable = (book: EligibilityBook) =>
  book.status !== BOOK_STATUS.active || book.unavailableForNewRequests

// Algum empréstimo ativo com o vencimento já passado (RF-EMP-04).
const hasOverdueLoan = (student: StudentCirculation, at: Date) =>
  student.openLoans.some(
    (loan) =>
      loan.status === LOAN_STATUS.active &&
      loan.dueAt !== undefined &&
      isOverdue(loan.dueAt, at),
  )

// Pedido ou empréstimo em andamento do mesmo título, de qualquer edição
// (RF-EMP-03).
const hasSameTitle = (book: EligibilityBook, student: StudentCirculation) =>
  student.openLoans.some(
    (loan) =>
      loan.workId === book.workId &&
      (loan.status === LOAN_STATUS.awaitingPickup ||
        loan.status === LOAN_STATUS.active),
  )

// Diz se o aluno pode pedir o empréstimo ou entrar na fila deste livro (RF-EMP-02
// a RF-EMP-04, RF-FIL-02, RF-FIL-03, RF-ACE-08). Devolve o primeiro motivo que
// bloqueia, nesta ordem:
//   pedido (request):    unavailable, overdue, same_title, loan_limit
//   fila (join_queue):   unavailable, overdue, queue_limit, not_queueable
// A fila só abre sem exemplar disponível (not_queueable). `at` é o "agora" das
// regras de negócio. A página do livro, o empréstimo e a fila usam esta mesma
// função.
export function checkRequestEligibility(input: {
  action: EligibilityAction
  book: EligibilityBook
  student: StudentCirculation
  limits: RequestLimits
  at: Date
}): EligibilityResult {
  const { action, book, student, limits, at } = input

  if (isUnavailable(book)) return blocked(BLOCKED_REASON.unavailable)
  if (hasOverdueLoan(student, at)) return blocked(BLOCKED_REASON.overdue)

  if (action === ELIGIBILITY_ACTION.request) {
    if (hasSameTitle(book, student)) return blocked(BLOCKED_REASON.sameTitle)
    if (student.activeLoanCount >= limits.maxActiveLoans) {
      return blocked(BLOCKED_REASON.loanLimit)
    }
    return ALLOWED
  }

  if (student.activeQueueCount >= limits.maxActiveQueues) {
    return blocked(BLOCKED_REASON.queueLimit)
  }
  if (book.copiesAvailable > 0) return blocked(BLOCKED_REASON.notQueueable)
  return ALLOWED
}
