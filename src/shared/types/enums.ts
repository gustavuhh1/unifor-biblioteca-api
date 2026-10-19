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

// Situação da conta: pending_email até confirmar o token (users.status).
export const USER_STATUSES = ['pending_email', 'active', 'disabled'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

// Finalidade do token de e-mail (emailTokens.purpose).
export const EMAIL_TOKEN_PURPOSES = [
  'email_confirmation',
  'password_reset',
] as const
export type EmailTokenPurpose = (typeof EMAIL_TOKEN_PURPOSES)[number]

// Finalidade do desafio do passkey (passkeyChallenges.purpose).
export const CHALLENGE_PURPOSES = ['registration', 'authentication'] as const
export type ChallengePurpose = (typeof CHALLENGE_PURPOSES)[number]

// --- Acervo ------------------------------------------------------------------

// Exemplar (copies.status).
export const COPY_STATUSES = [
  'available',
  'reserved',
  'on_loan',
  'withdrawn',
] as const
export type CopyStatus = (typeof COPY_STATUSES)[number]

// Situação da edição no acervo (books.status).
export const BOOK_STATUSES = ['active', 'removed'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]

// De onde vieram os dados da edição (books.dataSource).
export const DATA_SOURCES = ['google_books', 'manual', 'mixed'] as const
export type DataSource = (typeof DATA_SOURCES)[number]

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

// Como o pedido nasceu (loans.origin).
export const LOAN_ORIGINS = ['request', 'queue', 'assistant'] as const
export type LoanOrigin = (typeof LOAN_ORIGINS)[number]

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

// Quem colocou o aluno na fila (queueEntries.origin).
export const QUEUE_ORIGINS = ['student', 'assistant', 'librarian'] as const
export type QueueOrigin = (typeof QUEUE_ORIGINS)[number]

// Multa (fines.status).
export const FINE_STATUSES = ['accruing', 'open', 'paid'] as const
export type FineStatus = (typeof FINE_STATUSES)[number]

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

// Botões do aviso (notifications.action).
export const NOTIFICATION_ACTIONS = [
  'confirm_turn',
  'show_qr',
  'open_loan',
  'open_fine',
  'none',
] as const
export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number]

// Resultado da entrega do aviso em cada canal (notifications.delivery).
export const DELIVERY_STATUSES = [
  'sent',
  'failed',
  'disabled',
  'unsupported',
  'skipped',
] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

// Sistema do aparelho (devices.platform).
export const DEVICE_PLATFORMS = ['android', 'ios'] as const
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number]

// Quem escreveu a mensagem do Assistente (assistantMessages.sender).
export const ASSISTANT_SENDERS = ['student', 'assistant'] as const
export type AssistantSender = (typeof ASSISTANT_SENDERS)[number]

// Ação que o Assistente pode propor (assistantActions.type).
export const ASSISTANT_ACTION_TYPES = ['request_loan', 'join_queue'] as const
export type AssistantActionType = (typeof ASSISTANT_ACTION_TYPES)[number]

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

// Motivo de uma ação bloqueada (assistantActions.blockedReason).
export const ASSISTANT_BLOCKED_REASONS = [
  'overdue',
  'loan_limit',
  'queue_limit',
  'same_title',
  'unavailable',
  'not_queueable',
] as const
export type AssistantBlockedReason = (typeof ASSISTANT_BLOCKED_REASONS)[number]

// --- Sistema -----------------------------------------------------------------

// Abrangência do feriado (holidays.items.scope).
export const HOLIDAY_SCOPES = ['national', 'state', 'municipal'] as const
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number]

// Quem fez a ação registrada (auditLog.actorRole).
export const AUDIT_ACTOR_ROLES = ['student', 'librarian', 'system'] as const
export type AuditActorRole = (typeof AUDIT_ACTOR_ROLES)[number]

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
  'book_sync_google',
  'book_remove',
  'book_set_unavailable',
  'passkey_create',
  'passkey_remove',
  'password_reset',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

// Rotinas agendadas (jobRuns.job).
export const JOB_NAMES = [
  'expire_pickups',
  'advance_queues',
  'due_reminders',
  'accrue_fines',
  'refresh_holidays',
] as const
export type JobName = (typeof JOB_NAMES)[number]

// Situação de uma execução da rotina (jobRuns.status).
export const JOB_STATUSES = ['running', 'ok', 'error'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
