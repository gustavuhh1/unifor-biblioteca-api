import { isOverdue } from '../../../shared/time.js'
import {
  COPY_STATUS,
  type Book,
  type CopyRecord,
  type Loan,
} from '../../../shared/types/index.js'
import { RENEWAL_DENIAL_REASON } from '../loans.constants.js'
import type { RenewalDenialReason } from '../loans.types.js'

// Renovação do empréstimo (RF-EMP-09, RF-EMP-10, seção 2.9).

// Por que a renovação seria negada, ou null se ela pode ser feita. Devolve o
// primeiro motivo, nesta ordem: overdue (o vencimento já passou), has_queue (há
// gente na fila do livro) e already_renewed (as renovações já foram usadas).
export function renewalDenialOf(input: {
  loan: Pick<Loan, 'dueAt' | 'renewalCount'>
  book: Pick<Book, 'queueLength'>
  maxRenewals: number
  at: Date
}): RenewalDenialReason | null {
  const { loan, book, maxRenewals, at } = input
  if (loan.dueAt && isOverdue(loan.dueAt, at)) {
    return RENEWAL_DENIAL_REASON.overdue
  }
  if (book.queueLength > 0) return RENEWAL_DENIAL_REASON.hasQueue
  if (loan.renewalCount >= maxRenewals) {
    return RENEWAL_DENIAL_REASON.alreadyRenewed
  }
  return null
}

// O que gravar no empréstimo ao renovar: o vencimento antigo vira originalDueAt, o
// novo vencimento entra, a contagem sobe e a hora da renovação é registrada.
export function renewalUpdate(
  loan: Pick<Loan, 'dueAt' | 'renewalCount'>,
  newDueAt: Date,
  at: Date,
): Partial<Loan> {
  return {
    originalDueAt: loan.dueAt,
    dueAt: newDueAt,
    renewalCount: loan.renewalCount + 1,
    renewedAt: at,
    updatedAt: at,
  }
}

// Menor vencimento entre os exemplares emprestados do livro (books.nextReturnAt,
// seção 2.7), já com a mudança de um exemplar aplicada: `dueAt` é o novo vencimento
// dele (renovação, ou retirada de um exemplar que estava separado) ou undefined se
// ele deixou de estar emprestado (devolução). Sem nenhum emprestado, devolve
// undefined.
export function nextReturnAtOf(
  copies: readonly Pick<CopyRecord, 'id' | 'status' | 'dueAt'>[],
  changed: { copyId: string; dueAt: Date | undefined },
): Date | undefined {
  const dueDates = copies.flatMap((copy) => {
    if (copy.id === changed.copyId) return changed.dueAt ? [changed.dueAt] : []
    return copy.status === COPY_STATUS.onLoan && copy.dueAt ? [copy.dueAt] : []
  })
  return dueDates.length > 0
    ? new Date(Math.min(...dueDates.map((date) => date.getTime())))
    : undefined
}
