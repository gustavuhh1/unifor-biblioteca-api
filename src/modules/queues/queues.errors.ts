import { AppError } from '../../shared/errors.js'
import { BLOCKED_REASON } from '../../shared/types/index.js'
import { requestRefused } from '../loans/loans.errors.js'
import {
  ALREADY_IN_QUEUE_CODE,
  CONFIRM_DENIAL,
  PLACEMENT_REFUSAL,
} from './queues.constants.js'
import type { ConfirmDenial, PlacementRefusal } from './queues.types.js'
import type { JoinRefusal } from './rules/join.rules.js'

// Erros do módulo de filas. O code é estável e em inglês; a mensagem é mostrada
// ao usuário, em português. Os motivos de recusa do pedido (unavailable, overdue,
// same_title, loan_limit) e da fila (queue_limit, not_queueable) reaproveitam os
// textos do módulo de empréstimos.

// 404: o lugar na fila não existe ou é de outro aluno (a resposta é a mesma, para
// não revelar que ele existe).
export function queueEntryNotFound(): AppError {
  return new AppError(
    404,
    'queue_entry_not_found',
    'Lugar na fila não encontrado.',
  )
}

// 409: o lugar já saiu da fila ativa (o aluno saiu, perdeu a vez, foi removido,
// virou pedido ou a fila foi cancelada).
export function queueEntryNotActive(): AppError {
  return new AppError(
    409,
    CONFIRM_DENIAL.queueEntryNotActive,
    'Este lugar já saiu da fila.',
  )
}

// 400: as edições marcadas não são do mesmo livro (RF-FIL-04).
export function editionsMismatch(): AppError {
  return new AppError(
    400,
    'editions_mismatch',
    'As edições marcadas precisam ser do mesmo livro.',
  )
}

// 409: o aluno não pode entrar na fila desta edição (RF-FIL-02 a RF-FIL-04). O
// code é o próprio motivo.
export function joinRefused(reason: JoinRefusal): AppError {
  return reason === ALREADY_IN_QUEUE_CODE
    ? new AppError(409, reason, 'Você já está na fila deste livro.')
    : requestRefused(reason)
}

// Texto de cada motivo de recusa quando é o bibliotecário que põe o aluno na
// fila: fala do aluno em terceira pessoa.
const LIBRARIAN_JOIN_MESSAGES: Record<JoinRefusal, string> = {
  [BLOCKED_REASON.unavailable]:
    'Este livro não está disponível para novos pedidos.',
  [BLOCKED_REASON.overdue]: 'Este aluno tem um livro em atraso.',
  [BLOCKED_REASON.queueLimit]: 'Este aluno atingiu o limite de filas.',
  [BLOCKED_REASON.notQueueable]:
    'Este livro tem exemplar disponível. Peça o empréstimo em vez de entrar na fila.',
  [BLOCKED_REASON.sameTitle]:
    'Este aluno já tem esta edição em pedido ou emprestada.',
  [ALREADY_IN_QUEUE_CODE]: 'Este aluno já está na fila deste livro.',
  [BLOCKED_REASON.loanLimit]: 'Este aluno atingiu o limite de livros.',
}

// 409: o bibliotecário não pode pôr o aluno na fila (RF-BAL-06). O code é o
// próprio motivo.
export function librarianJoinRefused(reason: JoinRefusal) {
  return new AppError(409, reason, LIBRARIAN_JOIN_MESSAGES[reason])
}

// 404: a matrícula não é de um aluno ativo (RF-BAL-06).
export function studentNotFound(): AppError {
  return new AppError(404, 'student_not_found', 'Aluno não encontrado.')
}

// 400: faltou o motivo (RF-BAL-06, RF-BAL-07). Aponta o campo `reason`.
export function reasonRequired(message: string): AppError {
  return new AppError(400, 'reason_required', message, {
    fields: [{ field: 'reason', message }],
  })
}

// Texto de cada motivo de o aluno não poder confirmar a vez (RF-FIL-06).
const CONFIRM_MESSAGES: Record<ConfirmDenial, string> = {
  [CONFIRM_DENIAL.queueEntryNotActive]: 'Este lugar já saiu da fila.',
  [CONFIRM_DENIAL.notYourTurn]:
    'Ainda não é a sua vez. Você será avisado quando o livro voltar.',
  [CONFIRM_DENIAL.turnExpired]:
    'O prazo para confirmar a sua vez acabou, e você saiu da fila.',
}

// 409: o aluno não pode confirmar a vez. O code é o próprio motivo.
export function confirmDenied(denial: ConfirmDenial): AppError {
  return new AppError(409, denial, CONFIRM_MESSAGES[denial])
}

// Texto de cada motivo de a posição pedida ser recusada (RF-BAL-06).
const PLACEMENT_MESSAGES: Record<PlacementRefusal, string> = {
  [PLACEMENT_REFUSAL.invalidPosition]:
    'Essa posição não existe, ou fica antes de quem está na vez.',
  [PLACEMENT_REFUSAL.samePosition]: 'O aluno já está nessa posição.',
  [PLACEMENT_REFUSAL.turnInProgress]:
    'Quem está na vez não pode mudar de posição.',
}

// 409: a posição pedida na fila foi recusada. O code é o próprio motivo.
export function placementRefused(refusal: PlacementRefusal): AppError {
  return new AppError(409, refusal, PLACEMENT_MESSAGES[refusal])
}

// 409: só dá para reenviar o aviso de quem está na vez (RF-BAL-06).
export function resendNotYourTurn(): AppError {
  return new AppError(
    409,
    CONFIRM_DENIAL.notYourTurn,
    'Só dá para reenviar o aviso de quem está na vez.',
  )
}
