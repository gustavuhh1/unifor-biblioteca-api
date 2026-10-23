import { AppError } from '../../shared/errors.js'
import { BLOCKED_REASON, type BlockedReason } from '../../shared/types/index.js'
import {
  NO_COPY_AVAILABLE_CODE,
  RENEWAL_DENIAL_REASON,
} from './loans.constants.js'
import type { RenewalDenialReason } from './loans.types.js'

// Erros do módulo de empréstimos. O code é estável e em inglês; a mensagem é
// mostrada ao usuário, em português.

// Texto de cada motivo que bloqueia um pedido ou a entrada na fila (os mesmos
// BLOCKED_REASON da página do livro). O módulo da fila reaproveita estes textos.
const BLOCKED_MESSAGES: Record<BlockedReason, string> = {
  [BLOCKED_REASON.unavailable]:
    'Este livro não está disponível para novos pedidos.',
  [BLOCKED_REASON.overdue]:
    'Você tem um livro em atraso. Devolva-o no balcão para pedir outro.',
  [BLOCKED_REASON.sameTitle]:
    'Você já tem este livro, ou outra edição dele, em pedido ou emprestado.',
  [BLOCKED_REASON.loanLimit]:
    'Você atingiu o limite de livros ao mesmo tempo. Devolva um para pedir outro.',
  [BLOCKED_REASON.queueLimit]: 'Você atingiu o limite de filas ao mesmo tempo.',
  [BLOCKED_REASON.notQueueable]:
    'Este livro tem exemplar disponível. Peça o empréstimo em vez de entrar na fila.',
}

// 409: uma regra recusou o pedido (RF-EMP-02, RF-EMP-03, RF-EMP-04, RF-ACE-08). O
// code é o próprio motivo: unavailable, overdue, same_title ou loan_limit.
export function requestRefused(reason: BlockedReason): AppError {
  return new AppError(409, reason, BLOCKED_MESSAGES[reason])
}

// 409: não há exemplar disponível, ou a edição tem fila (regra 6 da seção 2.9). O
// caminho é entrar na fila.
export function noCopyAvailable(): AppError {
  return new AppError(
    409,
    NO_COPY_AVAILABLE_CODE,
    'Não há exemplar disponível agora. Entre na fila para ser avisado.',
  )
}

// 404: o pedido não existe ou é de outro aluno (a resposta é a mesma, para não
// revelar que o pedido existe).
export function loanNotFound(): AppError {
  return new AppError(404, 'loan_not_found', 'Pedido não encontrado.')
}

// 409: só pedido aguardando retirada pode ser cancelado (RF-EMP-05).
export function loanNotCancellable(): AppError {
  return new AppError(
    409,
    'loan_not_cancellable',
    'Só dá para cancelar um pedido que ainda não foi retirado.',
  )
}

// 409: só empréstimo ativo pode ser renovado (RF-EMP-09).
export function loanNotActive(): AppError {
  return new AppError(
    409,
    'loan_not_active',
    'Só dá para renovar um livro que você já retirou e ainda não devolveu.',
  )
}

// Texto de cada motivo de a renovação ser negada (RF-EMP-10).
const RENEWAL_MESSAGES: Record<RenewalDenialReason, string> = {
  [RENEWAL_DENIAL_REASON.overdue]:
    'Este livro está atrasado e não pode ser renovado. Devolva-o no balcão.',
  [RENEWAL_DENIAL_REASON.hasQueue]:
    'Há pessoas na fila deste livro, então ele não pode ser renovado.',
  [RENEWAL_DENIAL_REASON.alreadyRenewed]:
    'Este livro já foi renovado uma vez e não pode ser renovado de novo.',
}

// 409: a renovação foi negada (RF-EMP-10). O code é o motivo: overdue, has_queue
// ou already_renewed.
export function renewalDenied(reason: RenewalDenialReason): AppError {
  return new AppError(409, reason, RENEWAL_MESSAGES[reason])
}
