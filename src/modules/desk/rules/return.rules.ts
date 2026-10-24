import { localDate } from '../../../shared/calendar/dates.js'
import { LOAN_STATUS, type Loan } from '../../../shared/types/index.js'

// Regras da devolução no balcão (RF-BAL-04). Funções puras: recebem o "agora" em
// vez de ler o relógio.

// O que gravar no empréstimo ao registrar a devolução: ele vira `returned`, com a
// hora e quem recebeu o livro.
export function returnFields(input: {
  librarianUid: string
  at: Date
}): Partial<Loan> {
  return {
    status: LOAN_STATUS.returned,
    returnedAt: input.at,
    returnedTo: input.librarianUid,
    updatedAt: input.at,
  }
}

// Livros lidos por ano do aluno depois de mais uma devolução (users.booksReadByYear,
// ex.: { "2026": 17 }). O ano é o da devolução em Fortaleza, e os outros anos ficam
// como estão.
export function booksReadAfterReturn(
  booksReadByYear: Readonly<Record<string, number>>,
  at: Date,
): Record<string, number> {
  const year = localDate(at).slice(0, 4)
  return { ...booksReadByYear, [year]: (booksReadByYear[year] ?? 0) + 1 }
}
