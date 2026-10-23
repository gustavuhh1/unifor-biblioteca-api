import { initialsOf, normalizeText } from '../text.js'
import {
  USER_ROLE,
  type NotificationPrefs,
  type User,
  type UserRole,
  type UserStatus,
} from '../types/index.js'

// Preferências de aviso de um usuário novo: tudo ligado. "Sua vez na fila" e
// "Atraso e multa" não podem ser desligados.
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  queueTurn: true,
  overdueAndFines: true,
  dueReminders: true,
  pickupReady: true,
  queueUpdates: true,
  returnConfirmed: true,
  channelPush: true,
  channelEmail: true,
}

// Contadores do usuário; começam zerados.
type UserCounters = Pick<
  User,
  | 'activeLoanCount'
  | 'activeQueueCount'
  | 'openFineTotalCents'
  | 'booksReadByYear'
>

// Dados para montar um documento users novo.
export interface NewUserInput {
  role: UserRole
  matricula: string
  email: string
  authEmail: string
  status: UserStatus
  fullName?: string | undefined
  course?: string | undefined
  deskLabel?: string | undefined
  emailVerifiedAt?: Date | undefined
  counters?: Partial<UserCounters>
  createdAt: Date
  // Se faltar, vale o mesmo instante de createdAt.
  updatedAt?: Date
}

// Monta o documento users/{uid} padrão (seção 2.1): contadores zerados,
// preferências de aviso padrão e, para aluno, o ano de ingresso (2000 + os dois
// primeiros dígitos da matrícula). Campo sem valor não entra no documento,
// porque o Firestore recusa undefined. Usada pelo cadastro (RF-AUT-01) e pelo
// seed.
export function buildUserDocument(input: NewUserInput): User {
  return {
    role: input.role,
    matricula: input.matricula,
    ...(input.fullName
      ? {
          fullName: input.fullName,
          fullNameNormalized: normalizeText(input.fullName),
          initials: initialsOf(input.fullName),
        }
      : {}),
    email: input.email,
    authEmail: input.authEmail,
    status: input.status,
    ...(input.emailVerifiedAt
      ? { emailVerifiedAt: input.emailVerifiedAt }
      : {}),
    ...(input.course ? { course: input.course } : {}),
    ...(input.role === USER_ROLE.student
      ? { entryYear: 2000 + Number(input.matricula.slice(0, 2)) }
      : {}),
    ...(input.deskLabel ? { deskLabel: input.deskLabel } : {}),
    activeLoanCount: 0,
    activeQueueCount: 0,
    openFineTotalCents: 0,
    booksReadByYear: {},
    ...input.counters,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  }
}

// O nome que as listas e os avisos mostram do usuário: o nome do Perfil ou, sem
// ele, a matrícula (o nome não vem no cadastro). Os documentos de pedido, fila e
// multa copiam este valor.
export function displayNameOf(
  user: Pick<User, 'fullName' | 'matricula'>,
): string {
  return user.fullName ?? user.matricula
}
