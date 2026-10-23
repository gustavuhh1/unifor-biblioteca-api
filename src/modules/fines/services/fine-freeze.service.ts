import type { Transaction } from 'firebase-admin/firestore'
import type { LibraryCalendar } from '../../../shared/calendar/business-days.js'
import { normalizeText } from '../../../shared/text.js'
import {
  FINE_STATUS,
  type Cents,
  type Fine,
  type LoanRecord,
  type User,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'
import * as finesRepository from '../repositories/fines.repository.js'
import {
  buildFrozenFine,
  freezeFields,
  openTotalDelta,
  type FineReceiver,
} from '../rules/fine-amount.rules.js'

// Congela a multa na devolução (RF-MUL-02, RF-BAL-08). É uma função só, em duas
// fases, porque a transação do Firestore exige todas as leituras antes de qualquer
// gravação:
//
//   1. planFineFreeze  (leitura)  lê a multa do empréstimo e decide o que gravar;
//   2. applyFineFreeze (gravação) congela a multa e atualiza o total do aluno.
//
// Quem chama: onCopyReturned (módulo de empréstimos), que o balcão usa ao registrar
// a devolução. A rotina `accrue_fines` (RF-SIS-05, módulo `jobs`) cria a multa
// `accruing` no 1º dia útil de atraso; se a devolução vier antes dela, a multa
// nasce aqui, já congelada.

// O que a fase de gravação precisa saber, decidido na fase de leitura.
export type FineFreezePlan =
  // Sem multa: devolveu sem dia útil de atraso, ou a multa já estava congelada.
  | { kind: 'none' }
  // A multa `accruing` que já existia é congelada (ou paga, com "Multa paga agora").
  | { kind: 'update'; fineId: string; fields: Partial<Fine>; openDelta: Cents }
  // A multa não existia e nasce congelada, ligada ao empréstimo.
  | {
      kind: 'create'
      fineId: string
      loanId: string
      fine: Fine
      openDelta: Cents
    }

// A multa depois de congelar, como o balcão mostra na devolução.
export interface FrozenFineSummary {
  id: string
  status: Fine['status']
  businessDaysLate: number
  amountCents: Cents
}

// Fase 1 (leitura): decide o que fazer com a multa do empréstimo devolvido. Chame
// junto das outras leituras da transação, antes de gravar. `paidNow` é a chave
// "Multa paga agora": a multa fecha direto como paga (RF-BAL-08).
export async function planFineFreeze(
  tx: Transaction,
  input: {
    loan: LoanRecord
    student: User
    returnedAt: Date
    calendar: Pick<LibraryCalendar, 'closedDates'>
    ratePerBusinessDayCents: Cents
    paidNow?: FineReceiver | undefined
  },
): Promise<FineFreezePlan> {
  const { loan, student, returnedAt, calendar, paidNow } = input
  const closedDates = calendar.closedDates

  const existing = loan.fineId
    ? await finesRepository.findById(loan.fineId, tx)
    : undefined
  if (existing) {
    if (existing.status !== FINE_STATUS.accruing) return { kind: 'none' }
    const fields = freezeFields(existing, { returnedAt, closedDates, paidNow })
    return {
      kind: 'update',
      fineId: existing.id,
      fields,
      openDelta: openTotalDelta(fields),
    }
  }

  if (!loan.dueAt) return { kind: 'none' }
  const name = student.fullName ?? student.matricula
  const fine = buildFrozenFine({
    loan: { ...loan, dueAt: loan.dueAt },
    student: {
      matricula: student.matricula,
      name,
      nameNormalized: student.fullNameNormalized ?? normalizeText(name),
    },
    ratePerBusinessDayCents: input.ratePerBusinessDayCents,
    returnedAt,
    closedDates,
    paidNow,
  })
  if (!fine) return { kind: 'none' }
  return {
    kind: 'create',
    fineId: finesRepository.newFineId(),
    loanId: loan.id,
    fine,
    openDelta: openTotalDelta(fine),
  }
}

// Fase 2 (gravação): congela (ou cria) a multa e, se ficou em aberto, soma o valor
// em `users.openFineTotalCents` do aluno. Uma multa paga na devolução não soma.
// Chame depois de todas as leituras da transação.
export function applyFineFreeze(
  tx: Transaction,
  plan: FineFreezePlan,
  student: Pick<User, 'openFineTotalCents'> & { uid: string },
  at: Date,
): void {
  if (plan.kind === 'none') return
  if (plan.kind === 'update') {
    finesRepository.update(tx, plan.fineId, plan.fields)
  } else {
    finesRepository.create(tx, plan.fineId, plan.fine)
    loansRepository.update(tx, plan.loanId, {
      fineId: plan.fineId,
      updatedAt: at,
    })
  }
  if (plan.openDelta > 0) {
    usersRepository.setOpenFineTotalCents(
      tx,
      student.uid,
      student.openFineTotalCents + plan.openDelta,
      at,
    )
  }
}

// A multa como ficou, para a resposta da devolução; undefined se não há multa.
export function summaryOfFreeze(
  plan: FineFreezePlan,
): FrozenFineSummary | undefined {
  if (plan.kind === 'none') return undefined
  const fine = plan.kind === 'update' ? plan.fields : plan.fine
  return {
    id: plan.fineId,
    status: fine.status ?? FINE_STATUS.open,
    businessDaysLate: fine.businessDaysLate ?? 0,
    amountCents: fine.amountCents ?? 0,
  }
}
