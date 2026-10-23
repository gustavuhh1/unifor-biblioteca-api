import {
  LOAN_ORIGIN,
  LOAN_STATUS,
  type Loan,
  type LoanOrigin,
} from '../../../shared/types/index.js'

// O que o pedido copia do aluno, do livro e do exemplar (seção 2.9).
export interface NewLoanInput {
  student: { uid: string; matricula: string; name: string }
  book: { id: string; workId: string; title: string; shelf: string }
  copyId: string
  pickupCode: string
  qrToken: string
  loanDays: number
  pickupDeadline: Date
  // Como o pedido nasceu; sem ele, é um pedido direto (`request`).
  origin?: LoanOrigin
  // O lugar da fila que virou este pedido (origem `queue`, RF-FIL-06).
  queueEntryId?: string
  // Quando o pedido foi feito; também é createdAt e updatedAt.
  at: Date
}

// Monta o documento loans de um pedido (RF-EMP-01) ou da vez confirmada na fila
// (RF-FIL-06): aguardando retirada, com o prazo de retirada, o código curto e o
// segredo do QR, ainda sem retirada, vencimento nem renovação.
export function buildNewLoan(input: NewLoanInput): Loan {
  const { student, book, at } = input
  return {
    studentUid: student.uid,
    matricula: student.matricula,
    studentName: student.name,
    bookId: book.id,
    workId: book.workId,
    copyId: input.copyId,
    bookTitle: book.title,
    bookShelf: book.shelf,
    status: LOAN_STATUS.awaitingPickup,
    origin: input.origin ?? LOAN_ORIGIN.request,
    ...(input.queueEntryId ? { queueEntryId: input.queueEntryId } : {}),
    pickupCode: input.pickupCode,
    qrToken: input.qrToken,
    requestedAt: at,
    pickupDeadline: input.pickupDeadline,
    loanDays: input.loanDays,
    renewalCount: 0,
    remindersSent: {},
    createdAt: at,
    updatedAt: at,
  }
}
