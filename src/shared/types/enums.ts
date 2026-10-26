import { constantsOf } from '../constants-of.js'

// Tipos básicos e enums do modelo de dados (docs/modelo-de-dados-firestore.md,
// seções 0, 1.3 e 2). Cada enum tem a lista de valores (para validar com o Zod)
// e o tipo que sai dela.

// --- Tipos básicos -----------------------------------------------------------

// Dinheiro em centavos, sempre inteiro (R$ 2,00 = 200).
export type Cents = number

// Data sem hora, no formato "AAAA-MM-DD" (feriados e recessos).
export type DateOnly = string

// Todo documento tem createdAt e updatedAt, gravados pela API em UTC.
export interface Timestamps {
  createdAt: Date
  updatedAt: Date
}

// --- Usuários e acesso -------------------------------------------------------

// Perfil do usuário (users.role).
export const USER_ROLES = ['student', 'librarian'] as const
export type UserRole = (typeof USER_ROLES)[number]
// Valores com nome (cada texto escrito uma vez só): USER_ROLE.student, USER_ROLE.librarian.
export const USER_ROLE = constantsOf(USER_ROLES)

// Situação da conta: pending_email até confirmar o token (users.status).
export const USER_STATUSES = ['pending_email', 'active', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): USER_STATUS.pendingEmail, USER_STATUS.active.
export const USER_STATUS = constantsOf(USER_STATUSES)

// Finalidade do token de e-mail (emailTokens.purpose).
export const EMAIL_TOKEN_PURPOSES = [
  'email_confirmation',
  'password_reset',
] as const
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number]
// Valores com nome (cada texto escrito uma vez só): EMAIL_TOKEN_PURPOSE.emailConfirmation, EMAIL_TOKEN_PURPOSE.passwordReset.
export const EMAIL_TOKEN_PURPOSE = constantsOf(EMAIL_TOKEN_PURPOSES)

// Finalidade do desafio do passkey (passkeyChallenges.purpose).
export const CHALLENGE_PURPOSES = ['registration', 'authentication'] as const
export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number]
// Valores com nome (cada texto escrito uma vez só): CHALLENGE_PURPOSE.registration, CHALLENGE_PURPOSE.authentication.
export const CHALLENGE_PURPOSE = constantsOf(CHALLENGE_PURPOSES)

// --- Acervo ------------------------------------------------------------------

// Exemplar (copies.status).
export const COPY_STATUSES = [
  'available',
  'reserved',
  'on_loan',
  'withdrawn',
] as const
export type CopyStatus = (typeof COPY_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): COPY_STATUS.available, COPY_STATUS.reserved.
export const COPY_STATUS = constantsOf(COPY_STATUSES)

// Situação da edição no acervo (books.status).
export const BOOK_STATUSES = ['active', 'removed'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): BOOK_STATUS.active, BOOK_STATUS.removed.
export const BOOK_STATUS = constantsOf(BOOK_STATUSES)

// De onde vieram os dados da edição (books.dataSource): external (Open Library e
// BrasilAPI), manual (à mão) ou mixed (as duas coisas).
export const DATA_SOURCES = ['external', 'manual', 'mixed'] as const
export type DataSource = (typeof DATA_SOURCES)[number]
// Valores com nome (cada texto escrito uma vez só): DATA_SOURCE.external, DATA_SOURCE.manual.
export const DATA_SOURCE = constantsOf(DATA_SOURCES)

// Fontes externas dos dados do livro (books.externalMetadata.sources).
export const BOOK_METADATA_SOURCES = ['open_library', 'brasil_api'] as const
export type BookMetadataSource = (typeof BOOK_METADATA_SOURCES)[number]
// Valores com nome (cada texto escrito uma vez só): BOOK_METADATA_SOURCE.openLibrary, BOOK_METADATA_SOURCE.brasilApi.
export const BOOK_METADATA_SOURCE = constantsOf(BOOK_METADATA_SOURCES)

// O que a página do livro sugere ao aluno: pedir o empréstimo (há exemplar
// disponível) ou entrar na fila (não há).
export const ELIGIBILITY_ACTIONS = ['request', 'join_queue'] as const
export type EligibilityAction = (typeof ELIGIBILITY_ACTIONS)[number]
// Valores com nome (cada texto escrito uma vez só): ELIGIBILITY_ACTION.request, ELIGIBILITY_ACTION.joinQueue.
export const ELIGIBILITY_ACTION = constantsOf(ELIGIBILITY_ACTIONS)

// --- Circulação --------------------------------------------------------------

// Pedido e empréstimo (loans.status).
export const LOAN_STATUSES = [
  'awaiting_pickup',
  'active',
  'returned',
  'expired',
  'cancelled',
] as const
export type LoanStatus = (typeof LOAN_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): LOAN_STATUS.awaitingPickup, LOAN_STATUS.active.
export const LOAN_STATUS = constantsOf(LOAN_STATUSES)

// Pedidos e empréstimos ainda em circulação: contam no limite do aluno.
export const OPEN_LOAN_STATUSES = [
  LOAN_STATUS.awaitingPickup,
  LOAN_STATUS.active,
] as const

// Como o pedido nasceu (loans.origin).
export const LOAN_ORIGINS = ['request', 'queue', 'assistant'] as const
export type LoanOrigin = (typeof LOAN_ORIGINS)[number]
// Valores com nome (cada texto escrito uma vez só): LOAN_ORIGIN.request, LOAN_ORIGIN.queue.
export const LOAN_ORIGIN = constantsOf(LOAN_ORIGINS)

// Lugar na fila (queueEntries.status). "Filas ativas" = waiting + your_turn.
export const QUEUE_ENTRY_STATUSES = [
  'waiting',
  'your_turn',
  'fulfilled',
  'left',
  'missed',
  'removed',
  'cancelled_other_edition',
  'cancelled_book_removed',
] as const
export type QueueEntryStatus = (typeof QUEUE_ENTRY_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): QUEUE_ENTRY_STATUS.waiting, QUEUE_ENTRY_STATUS.yourTurn.
export const QUEUE_ENTRY_STATUS = constantsOf(QUEUE_ENTRY_STATUSES)

// Os dois status de uma fila ativa (waiting + your_turn): contam nas 7 filas do
// aluno e em books.queueLength.
export const ACTIVE_QUEUE_STATUSES = [
  QUEUE_ENTRY_STATUS.waiting,
  QUEUE_ENTRY_STATUS.yourTurn,
] as const

// Quem colocou o aluno na fila (queueEntries.origin).
export const QUEUE_ORIGINS = ['student', 'assistant', 'librarian'] as const
export type QueueOrigin = (typeof QUEUE_ORIGINS)[number]
// Valores com nome (cada texto escrito uma vez só): QUEUE_ORIGIN.student, QUEUE_ORIGIN.assistant.
export const QUEUE_ORIGIN = constantsOf(QUEUE_ORIGINS)

// Multa (fines.status).
export const FINE_STATUSES = ['accruing', 'open', 'paid'] as const
export type FineStatus = (typeof FINE_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): FINE_STATUS.accruing, FINE_STATUS.open.
export const FINE_STATUS = constantsOf(FINE_STATUSES)

// --- Avisos, aparelhos e Assistente -------------------------------------------

// Tipo do aviso dentro do app (notifications.type).
export const NOTIFICATION_TYPES = [
  'queue_turn',
  'queue_turn_missed',
  'queue_moved_up',
  'queue_position_changed',
  'queue_added_by_librarian',
  'queue_removed_by_librarian',
  'queue_cancelled_other_edition',
  'pickup_ready',
  'pickup_expiring',
  'pickup_expired',
  'loan_picked_up',
  'due_reminder',
  'overdue',
  'return_confirmed',
  'fine_open',
  'fine_paid',
  'renewal_done',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]
// Valores com nome (cada texto escrito uma vez só): NOTIFICATION_TYPE.queueTurn, NOTIFICATION_TYPE.queueTurnMissed.
export const NOTIFICATION_TYPE = constantsOf(NOTIFICATION_TYPES)

// Botões do aviso (notifications.action).
export const NOTIFICATION_ACTIONS = [
  'confirm_turn',
  'show_qr',
  'open_loan',
  'open_fine',
  'none',
] as const
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number]
// Valores com nome (cada texto escrito uma vez só): NOTIFICATION_ACTION.confirmTurn, NOTIFICATION_ACTION.showQr.
export const NOTIFICATION_ACTION = constantsOf(NOTIFICATION_ACTIONS)

// Resultado da entrega do aviso em cada canal (notifications.delivery).
export const DELIVERY_STATUSES = [
  'sent',
  'failed',
  'disabled',
  'unsupported',
  'skipped',
] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): DELIVERY_STATUS.sent, DELIVERY_STATUS.failed.
export const DELIVERY_STATUS = constantsOf(DELIVERY_STATUSES)

// Sistema do aparelho (devices.platform).
export const DEVICE_PLATFORMS = ['android', 'ios'] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]
// Valores com nome (cada texto escrito uma vez só): DEVICE_PLATFORM.android, DEVICE_PLATFORM.ios.
export const DEVICE_PLATFORM = constantsOf(DEVICE_PLATFORMS)

// Quem escreveu a mensagem do Assistente (assistantMessages.sender).
export const ASSISTANT_SENDERS = ['student', 'assistant'] as const
export type AssistantSender = (typeof ASSISTANT_SENDERS)[number]
// Valores com nome (cada texto escrito uma vez só): ASSISTANT_SENDER.student, ASSISTANT_SENDER.assistant.
export const ASSISTANT_SENDER = constantsOf(ASSISTANT_SENDERS)

// Ação que o Assistente pode propor (assistantActions.type).
export const ASSISTANT_ACTION_TYPES = ['request_loan', 'join_queue'] as const
export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number]
// Valores com nome (cada texto escrito uma vez só): ASSISTANT_ACTION_TYPE.requestLoan, ASSISTANT_ACTION_TYPE.joinQueue.
export const ASSISTANT_ACTION_TYPE = constantsOf(ASSISTANT_ACTION_TYPES)

// Situação da ação do Assistente (assistantActions.status).
export const ASSISTANT_ACTION_STATUSES = [
  'proposed',
  'confirmed',
  'cancelled',
  'expired',
  'blocked',
  'failed',
] as const
export type AssistantActionStatus = (typeof ASSISTANT_ACTION_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): ASSISTANT_ACTION_STATUS.proposed, ASSISTANT_ACTION_STATUS.confirmed.
export const ASSISTANT_ACTION_STATUS = constantsOf(ASSISTANT_ACTION_STATUSES)

// Motivo de um pedido ou de uma entrada na fila estar bloqueado. Vale para a
// ação do Assistente (assistantActions.blockedReason) e para o bloco de ação da
// página do livro.
export const BLOCKED_REASONS = [
  'overdue',
  'loan_limit',
  'queue_limit',
  'same_title',
  'unavailable',
  'not_queueable',
] as const
export type BlockedReason = (typeof BLOCKED_REASONS)[number]
// Valores com nome (cada texto escrito uma vez só): BLOCKED_REASON.overdue, BLOCKED_REASON.loanLimit.
export const BLOCKED_REASON = constantsOf(BLOCKED_REASONS)

// --- Sistema -----------------------------------------------------------------

// Abrangência do feriado (holidays.items.scope).
export const HOLIDAY_SCOPES = ['national', 'state', 'municipal'] as const
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number]
// Valores com nome (cada texto escrito uma vez só): HOLIDAY_SCOPE.national, HOLIDAY_SCOPE.state.
export const HOLIDAY_SCOPE = constantsOf(HOLIDAY_SCOPES)

// Quem fez a ação registrada (auditLog.actorRole).
export const AUDIT_ACTOR_ROLES = ['student', 'librarian', 'system'] as const
export type AuditActorRole = (typeof AUDIT_ACTOR_ROLES)[number]
// Valores com nome (cada texto escrito uma vez só): AUDIT_ACTOR_ROLE.student, AUDIT_ACTOR_ROLE.librarian.
export const AUDIT_ACTOR_ROLE = constantsOf(AUDIT_ACTOR_ROLES)

// Ações registradas no log de auditoria (auditLog.action).
export const AUDIT_ACTIONS = [
  'queue_add',
  'queue_move',
  'queue_remove',
  'queue_resend_notice',
  'loan_pickup',
  'loan_return',
  'fine_paid',
  'book_create',
  'book_update',
  'book_sync_external',
  'book_remove',
  'book_set_unavailable',
  'passkey_create',
  'passkey_remove',
  'password_reset',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
// Valores com nome (cada texto escrito uma vez só): AUDIT_ACTION.queueAdd, AUDIT_ACTION.queueMove.
export const AUDIT_ACTION = constantsOf(AUDIT_ACTIONS)

// Rotinas agendadas (jobRuns.job).
export const JOB_NAMES = [
  'expire_pickups',
  'advance_queues',
  'due_reminders',
  'accrue_fines',
  'refresh_holidays',
] as const
export type JobName = (typeof JOB_NAMES)[number]
// Valores com nome (cada texto escrito uma vez só): JOB_NAME.expirePickups, JOB_NAME.advanceQueues.
export const JOB_NAME = constantsOf(JOB_NAMES)

// Situação de uma execução da rotina (jobRuns.status).
export const JOB_STATUSES = ['running', 'ok', 'error'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
// Valores com nome (cada texto escrito uma vez só): JOB_STATUS.running, JOB_STATUS.ok.
export const JOB_STATUS = constantsOf(JOB_STATUSES)
