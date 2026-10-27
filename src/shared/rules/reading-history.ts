import {
  LOAN_STATUS,
  type LoanRecord,
  type ReadingHistory,
} from '../types/index.js'

const returnedTime = (loan: LoanRecord) => loan.returnedAt?.getTime() ?? 0

// Livros devolvidos do mais recente ao mais antigo, sem repetir e até o limite;
// as obras de todos os empréstimos ficam excluídas das sugestões (RF-ASS-03).
export function readingHistoryOf(
  loans: readonly LoanRecord[],
  limit: number,
): ReadingHistory {
  const returned = loans
    .filter((loan) => loan.status === LOAN_STATUS.returned)
    .sort((a, b) => returnedTime(b) - returnedTime(a))
  return {
    returnedBookIds: [...new Set(returned.map((loan) => loan.bookId))].slice(
      0,
      limit,
    ),
    borrowedWorkIds: new Set(loans.map((loan) => loan.workId)),
  }
}
