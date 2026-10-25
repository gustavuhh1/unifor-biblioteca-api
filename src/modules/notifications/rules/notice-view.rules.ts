import type {
  DeviceRecord,
  NotificationPrefs,
  NotificationRecord,
} from '../../../shared/types/index.js'
import type {
  DeviceResponse,
  NotificationPrefsResponse,
  NotificationResponse,
  NotificationsResponse,
} from '../notifications.types.js'
import { hasPush } from './delivery.rules.js'

// Como avisos, preferências e aparelhos aparecem nas respostas (RF-AVI-01 a
// RF-AVI-03). Funções puras.

// Um aviso na resposta: sem o resultado da entrega, que é assunto da API.
export function toNotificationResponse(
  notice: NotificationRecord,
): NotificationResponse {
  return {
    id: notice.id,
    type: notice.type,
    title: notice.title,
    body: notice.body,
    action: notice.action,
    bookId: notice.bookId ?? null,
    loanId: notice.loanId ?? null,
    queueEntryId: notice.queueEntryId ?? null,
    fineId: notice.fineId ?? null,
    readAt: notice.readAt?.toISOString() ?? null,
    createdAt: notice.createdAt.toISOString(),
  }
}

// A lista de avisos com quantos ainda não foram lidos.
export function toNotificationsResponse(
  notices: readonly NotificationRecord[],
): NotificationsResponse {
  return {
    items: notices.map(toNotificationResponse),
    unreadCount: notices.filter((notice) => !notice.readAt).length,
  }
}

// As preferências na resposta. "Sua vez" e "Atraso e multa" sempre ligadas.
export function toPrefsResponse(
  prefs: NotificationPrefs,
): NotificationPrefsResponse {
  return { ...prefs, queueTurn: true, overdueAndFines: true }
}

// Um aparelho na resposta (sem o token do Expo).
export function toDeviceResponse(device: DeviceRecord): DeviceResponse {
  return {
    id: device.id,
    platform: device.platform,
    deviceName: device.deviceName ?? null,
    appVersion: device.appVersion ?? null,
    pushEnabled: hasPush(device),
    lastSeenAt: device.lastSeenAt.toISOString(),
  }
}
