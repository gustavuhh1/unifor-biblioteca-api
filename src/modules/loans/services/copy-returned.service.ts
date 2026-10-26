import type { Transaction } from 'firebase-admin/firestore'
import type { LibraryCalendar } from '../../../shared/calendar/business-days.js'
import type { LoanSettings } from '../../../shared/firestore/settings.js'
import type {
  BookRecord,
  CopyRecord,
  LoanRecord,
  User,
} from '../../../shared/types/index.js'
import type { FineReceiver } from '../../fines/rules/fine-amount.rules.js'
import {
  applyFineFreeze,
  planFineFreeze,
  summaryOfFreeze,
  type FrozenFineSummary,
} from '../../fines/services/fine-freeze.service.js'
import { applyCopyRelease, planCopyRelease } from './copy-release.service.js'

// Entrada de onCopyReturned: o que o balcão já leu na transação da devolução.
export interface CopyReturnedInput {
  // O empréstimo que está sendo devolvido.
  loan: LoanRecord
  // O aluno dono do empréstimo (`uid` é o id do documento).
  student: User & { uid: string }
  book: BookRecord
  copy: CopyRecord
  // Quem recebeu a multa no balcão, na chave "Multa paga agora" (RF-BAL-08).
  paidNow?: FineReceiver | undefined
  calendar: Pick<LibraryCalendar, 'closedDates'>
  settings: Pick<LoanSettings, 'fineCentsPerBusinessDay' | 'queueConfirmHours'>
}

// O que aconteceu, para a resposta da devolução.
export interface CopyReturnedResult {
  // A multa depois de congelar; undefined se a devolução não gerou multa.
  fine: FrozenFineSummary | undefined
  // O lugar da fila que recebeu a vez; undefined se o exemplar voltou à estante.
  turnStartedFor: string | undefined
}

// O livro foi devolvido: congela a multa e passa a vez para o próximo da fila
// (RF-MUL-02, RF-BAL-08, RF-FIL-06).
//
// QUEM CHAMA: o módulo do balcão (`desk`), ao registrar a devolução (RF-BAL-04),
// dentro da mesma transação em que marca o empréstimo como `returned` e acerta os
// contadores do aluno. A rota fica em POST /librarian/loans/:loanId/return. A
// rotina que expira pedidos não retirados usa só copy-release.service, porque não
// há multa nem devolução nesse caso.
//
// COMO CHAMAR: a transação do Firestore exige todas as leituras antes de qualquer
// gravação. Esta função lê (a multa do empréstimo e o 1º da fila) e depois grava,
// então o balcão a chama depois de TODAS as suas leituras (empréstimo, aluno, livro,
// exemplar) e antes das suas gravações. Ela grava a multa (congelada, ou paga na
// hora), `users.openFineTotalCents` e o exemplar (guardado para o 1º da fila, que
// ganha a vez e o aviso, ou de volta à estante). O balcão grava o resto: o
// empréstimo `returned`, `activeLoanCount` e `booksReadByYear` do aluno e o auditLog
// `loan_return`.
export async function onCopyReturned(
  tx: Transaction,
  input: CopyReturnedInput,
  at: Date,
): Promise<CopyReturnedResult> {
  const { loan, student, book, copy, settings } = input

  const finePlan = await planFineFreeze(tx, {
    loan,
    student,
    returnedAt: at,
    calendar: input.calendar,
    ratePerBusinessDayCents: settings.fineCentsPerBusinessDay,
    paidNow: input.paidNow,
  })
  const release = await planCopyRelease(tx, book, copy)

  applyFineFreeze(tx, finePlan, student, at)
  applyCopyRelease(tx, release, at, settings)

  return {
    fine: summaryOfFreeze(finePlan),
    turnStartedFor: release.queueTarget?.entry.id,
  }
}
