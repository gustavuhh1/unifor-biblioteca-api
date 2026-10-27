import { AppError } from '../../shared/errors.js'

// Erros do módulo do Assistente. O code é estável e em inglês; a mensagem é
// mostrada ao usuário, em português. As recusas do empréstimo e da fila na
// confirmação usam os erros daqueles módulos (mesmas regras, RF-ASS-04).

// 404: a ação não existe ou é de outro aluno.
export function assistantActionNotFound(): AppError {
  return new AppError(
    404,
    'assistant_action_not_found',
    'Ação do Assistente não encontrada.',
  )
}

// 409: a ação já foi confirmada, cancelada, bloqueada ou falhou.
export function assistantActionNotPending(): AppError {
  return new AppError(
    409,
    'assistant_action_not_pending',
    'Esta ação não está mais esperando a sua confirmação.',
  )
}

// 409: passou o tempo para confirmar a ação (15 minutos, settings/library).
export function assistantActionExpired(): AppError {
  return new AppError(
    409,
    'assistant_action_expired',
    'O tempo para confirmar esta ação acabou. Peça de novo ao Assistente.',
  )
}
