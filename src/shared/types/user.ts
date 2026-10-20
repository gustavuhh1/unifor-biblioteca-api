import type {
  AssistantActionStatus,
  AssistantActionType,
  AssistantBlockedReason,
  AssistantSender,
  Cents,
  DevicePlatform,
  DeliveryStatus,
  NotificationAction,
  NotificationType,
  Timestamps,
  UserRole,
  UserStatus,
} from './enums.js'

// Documentos do usuário e de suas subcoleções (docs/modelo-de-dados-firestore.md,
// seções 2.1, 2.2 e 2.12 a 2.18).

// Preferências de aviso. As duas primeiras ficam sempre ligadas.
export interface NotificationPrefs {
  queueTurn: boolean
  overdueAndFines: boolean
  dueReminders: boolean
  pickupReady: boolean
  queueUpdates: boolean
  returnConfirmed: boolean
  // Só tem efeito no Android (no iPhone não há push).
  channelPush: boolean
  channelEmail: boolean
}

// users/{uid}: aluno ou bibliotecário. O id é o uid do Firebase Authentication.
export interface User extends Timestamps {
  role: UserRole
  // Exatamente 7 dígitos; os 2 primeiros são o ano de ingresso. Única.
  matricula: string
  // O nome não vem no cadastro (decidido em 19/10): o aluno preenche no Perfil.
  // Sem nome, as telas mostram a matrícula.
  fullName?: string
  // Minúsculas e sem acento, para a busca por nome. Só existe com fullName.
  fullNameNormalized?: string
  // Ex.: "LA" (avatar). Só existe com fullName.
  initials?: string
  // E-mail real. Aluno: termina em @edu.unifor.br. Único.
  email: string
  // <matrícula>@contas.uni-books.app; a conta do Firebase usa este e-mail.
  authEmail: string
  status: UserStatus
  emailVerifiedAt?: Date
  // Aluno.
  course?: string
  // Aluno: 2000 + os dois primeiros dígitos da matrícula.
  entryYear?: number
  // Bibliotecário.
  deskLabel?: string
  // Pedidos aguardando retirada + empréstimos ativos. Limite 10.
  activeLoanCount: number
  // Lugares em fila waiting + your_turn. Cada edição conta 1. Limite 7.
  activeQueueCount: number
  openFineTotalCents: Cents
  // Ex.: { "2026": 17 }.
  booksReadByYear: Record<string, number>
  notificationPrefs: NotificationPrefs
  onboardingSeenAt?: Date
  lastLoginAt?: Date
}

// matriculaIndex/{matricula}: garante a matrícula única.
export interface MatriculaIndex extends Timestamps {
  uid: string
  role: UserRole
}

// emailIndex/{email}: garante o e-mail único (id em minúsculas).
export interface EmailIndex extends Timestamps {
  uid: string
}

// users/{uid}/savedBooks/{bookId}: o livro está em "Todos os salvos".
export interface SavedBook extends Timestamps {
  bookId: string
  savedAt: Date
  folderIds: string[]
}

// users/{uid}/folders/{folderId}: pasta de Salvos.
export interface Folder extends Timestamps {
  // De 1 a 30 caracteres.
  name: string
  bookCount: number
}

// Entrega de um aviso em cada canal.
export interface NotificationDelivery {
  push: DeliveryStatus
  email: DeliveryStatus
}

// users/{uid}/notifications/{notificationId}: aviso dentro do app.
export interface UserNotification extends Timestamps {
  type: NotificationType
  title: string
  body: string
  bookId?: string
  loanId?: string
  queueEntryId?: string
  fineId?: string
  action: NotificationAction
  readAt?: Date
  delivery: NotificationDelivery
}

// users/{uid}/devices/{deviceId}: token de push por aparelho.
export interface Device extends Timestamps {
  platform: DevicePlatform
  // Só Android.
  expoPushToken?: string
  deviceName?: string
  appVersion?: string
  lastSeenAt: Date
  pushDisabledAt?: Date
}

// users/{uid}/assistantMessages/{messageId}: conversa com o Assistente.
export interface AssistantMessage extends Timestamps {
  sender: AssistantSender
  text: string
  suggestedBookIds?: string[]
  actionId?: string
  blockedReason?: string
  error?: boolean
}

// O que o cartão da ação do Assistente mostra.
export interface AssistantActionPreview {
  pickupDeadline?: Date
  activeLoansAfter?: number
  queuePosition?: number
}

// users/{uid}/assistantActions/{actionId}: ação proposta, esperando confirmação.
export interface AssistantAction extends Timestamps {
  type: AssistantActionType
  bookIds: string[]
  status: AssistantActionStatus
  blockedReason?: AssistantBlockedReason
  preview: AssistantActionPreview
  // createdAt + 15 minutos. Campo de TTL.
  expiresAt: Date
  resultLoanId?: string
  resultQueueEntryIds?: string[]
}

// recommendations/{uid}: "Recomendados para você" (cache).
export interface Recommendation extends Timestamps {
  // Até 6 livros.
  bookIds: string[]
  reasonText: string
  generatedAt: Date
  // generatedAt + 24 horas.
  validUntil: Date
}
