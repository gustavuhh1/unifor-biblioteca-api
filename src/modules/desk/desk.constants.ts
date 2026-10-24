import {
  PICKUP_CODE_DIGITS,
  PICKUP_CODE_PREFIX,
} from '../loans/loans.constants.js'

// Quantos pedidos a lista Retiradas devolve por consulta (RF-BAL-05).
export const PICKUP_LIST_LIMIT = 200

// Código curto do pedido digitado no balcão ("RET-4821"), sem diferenciar
// maiúsculas de minúsculas (RF-BAL-03).
export const PICKUP_CODE_PATTERN = new RegExp(
  `^${PICKUP_CODE_PREFIX}\\d{${PICKUP_CODE_DIGITS}}$`,
  'i',
)

// Tamanho máximo aceito do segredo do QR, só para limitar a entrada (o que a API
// gera tem 32 caracteres).
export const QR_TOKEN_MAX_LENGTH = 200

// A busca da lista Retiradas é pelos dígitos da matrícula, de 1 a 7 (RF-BAL-05).
export const MATRICULA_SEARCH = /^\d{1,7}$/
