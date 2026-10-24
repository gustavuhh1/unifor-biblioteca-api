import { AppError } from '../../shared/errors.js'
import {
  BLOCKED_REASON,
  LOAN_STATUS,
  type LoanStatus,
} from '../../shared/types/index.js'

// Erros do módulo do balcão. O code é estável e em inglês; a mensagem é mostrada
// ao bibliotecário, em português. O pedido que não existe reaproveita o
// loanNotFound do módulo de empréstimos.

// 404: a matrícula não é de um aluno ativo (RF-BAL-03). A resposta é a mesma para
// matrícula inexistente, de bibliotecário ou de cadastro ainda não confirmado.
export function studentNotFound(): AppError {
  return new AppError(404, 'student_not_found', 'Aluno não encontrado.')
}

// O que dizer de um pedido que não está mais aguardando a retirada, segundo o
// estado em que ele ficou.
const NOT_AWAITING_MESSAGES: Partial<Record<LoanStatus, string>> = {
  [LOAN_STATUS.active]: 'Este pedido já foi retirado.',
  [LOAN_STATUS.returned]: 'Este pedido já foi retirado e devolvido.',
  [LOAN_STATUS.cancelled]: 'Este pedido foi cancelado pelo aluno.',
  [LOAN_STATUS.expired]: 'O prazo de retirada deste pedido terminou.',
}

// 409: o pedido não está aguardando a retirada (RF-BAL-02): já foi retirado,
// devolvido, cancelado ou expirou.
export function loanNotAwaitingPickup(status: LoanStatus): AppError {
  return new AppError(
    409,
    'loan_not_awaiting_pickup',
    NOT_AWAITING_MESSAGES[status] ??
      'Este pedido não está aguardando a retirada.',
  )
}

// 409: o prazo de retirada passou, mas a rotina ainda não expirou o pedido
// (RF-EMP-06). O exemplar volta ao acervo quando ela rodar.
export function pickupExpired(): AppError {
  return new AppError(
    409,
    'pickup_expired',
    'O prazo de retirada deste pedido terminou. O exemplar volta ao acervo.',
  )
}

// 409: o aluno tem livro atrasado e não pode retirar outro (RF-EMP-04). O code é
// o mesmo motivo que bloqueia o pedido: `overdue`.
export function studentOverdue(): AppError {
  return new AppError(
    409,
    BLOCKED_REASON.overdue,
    'O aluno tem um livro em atraso e não pode retirar outro. Registre a devolução primeiro.',
  )
}

// 409: só empréstimo ativo pode ser devolvido (RF-BAL-04).
export function loanNotReturnable(): AppError {
  return new AppError(
    409,
    'loan_not_active',
    'Só dá para registrar a devolução de um livro que está com o aluno.',
  )
}
