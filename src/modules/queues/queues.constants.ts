import { QUEUE_ENTRY_STATUS } from '../../shared/types/index.js'

// Constantes do módulo de filas (RF-FIL-*, RF-BAL-06, RF-BAL-07).

// Distância entre o `order` de dois lugares seguidos: a entrada normal usa o
// maior `order` da fila + este passo (seção 2.10).
export const QUEUE_ORDER_STEP = 1000

// Quantas edições uma entrada na fila pode marcar de uma vez. O limite de 7 filas
// é a regra de negócio; este número só limita o tamanho do corpo da requisição.
export const MAX_EDITIONS_PER_JOIN = 20

// Tamanho máximo do motivo escrito pelo bibliotecário.
export const REASON_MAX_LENGTH = 300

// Code do erro 409 quando o aluno já tem lugar ativo na fila da edição
// (regra 4 da seção 2.10). Os outros motivos de recusa são os BLOCKED_REASON.
export const ALREADY_IN_QUEUE_CODE = 'already_in_queue'

// Status com que um lugar sai da fila ativa sem virar pedido (seção 1.3): o
// aluno saiu, perdeu a vez, o bibliotecário removeu, ou outra edição chegou
// primeiro.
export const QUEUE_EXIT_STATUSES = [
  QUEUE_ENTRY_STATUS.left,
  QUEUE_ENTRY_STATUS.missed,
  QUEUE_ENTRY_STATUS.removed,
  QUEUE_ENTRY_STATUS.cancelledOtherEdition,
] as const
