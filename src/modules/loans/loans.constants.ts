import { constantsOf } from '../../shared/constants-of.js'

// Abas de Meus empréstimos (RF-EMP-08): o que está em andamento (pedido para
// retirar e empréstimo ativo) e o histórico (devolvido, expirado e cancelado).
export const LOAN_VIEWS = ['active', 'history'] as const

// As mesmas abas com nome: LOAN_VIEW.active, LOAN_VIEW.history.
export const LOAN_VIEW = constantsOf(LOAN_VIEWS)

// Estado mostrado ao aluno, calculado na hora (RF-SIS-03). Nenhum deles é gravado,
// menos os três últimos, que repetem loans.status.
export const LOAN_DISPLAY_STATES = [
  'ready_for_pickup',
  'in_progress',
  'due_soon',
  'overdue',
  'returned',
  'expired',
  'cancelled',
] as const

// Os mesmos estados com nome: LOAN_DISPLAY_STATE.readyForPickup, .dueSoon etc.
export const LOAN_DISPLAY_STATE = constantsOf(LOAN_DISPLAY_STATES)

// Motivos de a renovação ser negada (RF-EMP-10). Também são o code do erro 409.
export const RENEWAL_DENIAL_REASONS = [
  'overdue',
  'has_queue',
  'already_renewed',
] as const

// Os mesmos motivos com nome: RENEWAL_DENIAL_REASON.overdue, .hasQueue etc.
export const RENEWAL_DENIAL_REASON = constantsOf(RENEWAL_DENIAL_REASONS)

// Code do erro 409 quando não há exemplar disponível ou a fila da edição não
// está vazia (regra 6 da seção 2.9). Os outros motivos de recusa do pedido
// (overdue, loan_limit, same_title, unavailable) são os BLOCKED_REASON.
export const NO_COPY_AVAILABLE_CODE = 'no_copy_available'

// Código curto de retirada, digitado no balcão sem QR: "RET-" + 4 dígitos.
export const PICKUP_CODE_PREFIX = 'RET-'
export const PICKUP_CODE_DIGITS = 4

// Tamanho, em bytes, do segredo aleatório do QR (24 bytes = 192 bits, acima dos
// 128 bits pedidos em RF-EMP-07).
export const QR_TOKEN_BYTES = 24

// Quantos pedidos e empréstimos Meus empréstimos devolve por consulta.
export const LOAN_LIST_LIMIT = 200
