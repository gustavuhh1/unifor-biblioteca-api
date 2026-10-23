import { isoOrNull } from '../../../shared/iso-date.js'
import { searchTermsOf } from '../../../shared/search-text.js'
import {
  FINE_STATUS,
  type DateOnly,
  type FineRecord,
} from '../../../shared/types/index.js'
import type { FineResponse, LibrarianFineResponse } from '../fines.types.js'
import { calculateFine, type FineCalculation } from './fine-amount.rules.js'

// Como Minhas multas e a aba Multas mostram uma multa (RF-MUL-03, RF-BAL-09).
// Na multa `accruing` os dias e o valor são calculados na hora, a partir de
// `at`; nas outras são os valores congelados na devolução.

// Dias úteis de atraso e valor a mostrar agora: calculados na hora enquanto o
// livro não volta (`accruing`), congelados depois (RF-MUL-02).
export function currentFineValues(
  fine: Pick<
    FineRecord,
    | 'status'
    | 'dueAt'
    | 'ratePerBusinessDayCents'
    | 'businessDaysLate'
    | 'amountCents'
  >,
  at: Date,
  closedDates: ReadonlySet<DateOnly>,
): FineCalculation {
  if (fine.status === FINE_STATUS.accruing) {
    return calculateFine({
      dueAt: fine.dueAt,
      until: at,
      ratePerBusinessDayCents: fine.ratePerBusinessDayCents,
      closedDates,
    })
  }
  return {
    businessDaysLate: fine.businessDaysLate ?? 0,
    amountCents: fine.amountCents ?? 0,
  }
}

// Monta a multa da resposta do aluno.
export function toFineResponse(
  fine: FineRecord,
  at: Date,
  closedDates: ReadonlySet<DateOnly>,
): FineResponse {
  const { businessDaysLate, amountCents } = currentFineValues(
    fine,
    at,
    closedDates,
  )
  return {
    id: fine.id,
    loanId: fine.loanId,
    bookId: fine.bookId,
    bookTitle: fine.bookTitle,
    status: fine.status,
    dueAt: fine.dueAt.toISOString(),
    businessDaysLate,
    ratePerBusinessDayCents: fine.ratePerBusinessDayCents,
    amountCents,
    frozenAt: isoOrNull(fine.frozenAt),
    paidAt: isoOrNull(fine.paidAt),
    receivedByName: fine.receivedByName ?? null,
  }
}

// Monta a multa da aba Multas: a mesma do aluno, mais quem deve e se foi paga na
// devolução.
export function toLibrarianFineResponse(
  fine: FineRecord,
  at: Date,
  closedDates: ReadonlySet<DateOnly>,
): LibrarianFineResponse {
  return {
    ...toFineResponse(fine, at, closedDates),
    studentName: fine.studentName,
    matricula: fine.matricula,
    paidAtReturn: fine.paidAtReturn ?? false,
  }
}

// Soma, em centavos, as multas em aberto (`open`) da lista (RF-MUL-04: o aviso
// "você tem R$ X em aberto").
export function openTotalCentsOf(
  fines: readonly Pick<FineResponse, 'status' | 'amountCents'>[],
): number {
  return fines
    .filter((fine) => fine.status === FINE_STATUS.open)
    .reduce((total, fine) => total + fine.amountCents, 0)
}

// Diz se a multa aparece na busca da aba Multas (RF-BAL-09): pela matrícula
// inteira, ou por parte do nome, sem acento nem maiúsculas (todas as palavras
// digitadas precisam estar no nome). Busca vazia mostra tudo.
export function matchesFineSearch(
  fine: Pick<FineRecord, 'matricula' | 'studentNameNormalized'>,
  query: string | undefined,
): boolean {
  const terms = searchTermsOf(query ?? '')
  if (terms.length === 0) return true
  if (fine.matricula === (query ?? '').trim()) return true
  return terms.every((term) => fine.studentNameNormalized.includes(term))
}
