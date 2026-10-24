import { hasOverdueLoan } from '../../../shared/rules/request-eligibility.js'
import type { StudentCirculation } from '../../../shared/rules/request-eligibility.js'
import { LOAN_STATUS, type Loan } from '../../../shared/types/index.js'

// Regras da retirada no balcão (RF-BAL-02, RF-EMP-04, RF-EMP-06). Funções puras:
// recebem o "agora" em vez de ler o relógio.

// Por que a retirada é recusada: o prazo de retirada passou (`expired`) ou o aluno
// tem livro atrasado (`overdue`).
export type PickupDenial = 'expired' | 'overdue'

// Diz se a retirada deve ser recusada. O prazo vencido vale mais que o atraso: o
// pedido já perdeu o direito ao exemplar. Multa em aberto sem livro atrasado não
// bloqueia (RF-MUL-04), por isso só o empréstimo atrasado conta.
export function pickupDenialOf(input: {
  loan: Pick<Loan, 'pickupDeadline'>
  student: StudentCirculation
  at: Date
}): PickupDenial | null {
  const { loan, student, at } = input
  if (loan.pickupDeadline.getTime() < at.getTime()) return 'expired'
  if (hasOverdueLoan(student, at)) return 'overdue'
  return null
}

// O que gravar no pedido ao registrar a retirada: ele vira empréstimo ativo, com
// a hora, quem entregou e o vencimento (retirada + 14 dias, no fechamento).
export function pickupFields(input: {
  librarianUid: string
  dueAt: Date
  at: Date
}): Partial<Loan> {
  return {
    status: LOAN_STATUS.active,
    pickedUpAt: input.at,
    pickedUpBy: input.librarianUid,
    dueAt: input.dueAt,
    updatedAt: input.at,
  }
}
