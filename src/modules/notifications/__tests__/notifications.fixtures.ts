import { DEFAULT_NOTIFICATION_PREFS } from '../../../shared/domain/user.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import {
  DELIVERY_STATUS,
  NOTIFICATION_ACTION,
  NOTIFICATION_TYPE,
  type DeviceRecord,
  type NotificationPrefs,
  type NotificationRecord,
} from '../../../shared/types/index.js'

// Apoio dos testes de avisos: o aluno, os avisos e os aparelhos no Firestore falso.

export const STUDENT = 'uid_lucas'
export const EMAIL = 'lucas.almeida@edu.unifor.br'
export const TOKEN = 'ExponentPushToken[abc123]'

// Instante fixo dos testes de avisos (22/10/2026, 12:00 UTC).
export const AT = new Date('2026-10-22T12:00:00Z')

const NOTICES = `users/${STUDENT}/notifications`
const DEVICES = `users/${STUDENT}/devices`

// Aviso de exemplo ("É a sua vez"), recém-gravado: os dois canais `skipped`.
export function makeNotice(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    id: 'n1',
    type: NOTIFICATION_TYPE.queueTurn,
    title: 'É a sua vez: Código Limpo',
    body: 'Confirme até amanhã, 09:12, que vai retirar.',
    bookId: 'book1',
    queueEntryId: 'qe1',
    action: NOTIFICATION_ACTION.confirmTurn,
    delivery: {
      push: DELIVERY_STATUS.skipped,
      email: DELIVERY_STATUS.skipped,
    },
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}

// Grava o aluno com as preferências dadas (o padrão tudo ligado).
export function putStudent(
  db: FakeFirestore,
  prefs: Partial<NotificationPrefs> = {},
  uid: string = STUDENT,
): void {
  db.put('users', uid, {
    role: 'student',
    status: 'active',
    email: EMAIL,
    fullName: 'Lucas Almeida',
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...prefs },
    createdAt: AT,
    updatedAt: AT,
  })
}

// Grava um aviso do aluno.
export function putNotice(
  db: FakeFirestore,
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  const notice = makeNotice(overrides)
  const data: Record<string, unknown> = { ...notice }
  delete data.id
  db.put(NOTICES, notice.id, data)
  return notice
}

// Aparelho de exemplo: Android com token do Expo.
export function makeDevice(
  overrides: Partial<DeviceRecord> = {},
): DeviceRecord {
  return {
    id: 'device1',
    platform: 'android',
    expoPushToken: TOKEN,
    lastSeenAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}

// Grava um aparelho do aluno.
export function putDevice(
  db: FakeFirestore,
  overrides: Partial<DeviceRecord> = {},
): DeviceRecord {
  const device = makeDevice(overrides)
  const data: Record<string, unknown> = { ...device }
  delete data.id
  db.put(DEVICES, device.id, data)
  return device
}

export const noticePath = NOTICES
export const devicePath = DEVICES
