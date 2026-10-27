import { LOAN_STATUS, type LoanRecord } from '../../../shared/types/index.js'
import { HISTORY_BOOKS_LIMIT } from '../assistant.constants.js'

// Histórico de leitura do aluno para as sugestões (RF-ASS-03): os livros que ele
// devolveu e as obras que ele já pegou alguma vez (para não sugerir de novo).

export interface ReadingHistory {
  // Livros devolvidos, do mais recente para o mais antigo, sem repetir.
  returnedBookIds: string[]
  // Obras de todos os empréstimos do aluno (qualquer situação).
  borrowedWorkIds: Set<string>
}

const returnedTime = (loan: LoanRecord) => loan.returnedAt?.getTime() ?? 0

// Monta o histórico a partir dos empréstimos do aluno.
export function readingHistoryOf(loans: readonly LoanRecord[]): ReadingHistory {
  const returned = loans
    .filter((loan) => loan.status === LOAN_STATUS.returned)
    .sort((a, b) => returnedTime(b) - returnedTime(a))
  return {
    returnedBookIds: [...new Set(returned.map((loan) => loan.bookId))].slice(
      0,
      HISTORY_BOOKS_LIMIT,
    ),
    borrowedWorkIds: new Set(loans.map((loan) => loan.workId)),
  }
}
