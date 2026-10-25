import {
  DELIVERY_STATUS,
  NOTIFICATION_TYPE,
  type DeliveryStatus,
  type DeviceRecord,
  type NotificationPrefs,
  type NotificationType,
} from '../../../shared/types/index.js'
import type { PushTicketStatus } from '../push/expo-push.client.js'

// Quem recebe cada aviso por push e por e-mail (RF-AVI-02, RF-AVI-03). Funções
// puras. O aviso dentro do app não passa por aqui: ele aparece sempre, qualquer
// que seja a preferência (RNF-CON-02).

// Qual preferência manda em cada tipo de aviso (seção 2.1 do modelo de dados).
const PREFERENCE_OF_TYPE: Record<NotificationType, keyof NotificationPrefs> = {
  [NOTIFICATION_TYPE.queueTurn]: 'queueTurn',
  [NOTIFICATION_TYPE.queueTurnMissed]: 'queueTurn',
  [NOTIFICATION_TYPE.overdue]: 'overdueAndFines',
  [NOTIFICATION_TYPE.fineOpen]: 'overdueAndFines',
  [NOTIFICATION_TYPE.dueReminder]: 'dueReminders',
  [NOTIFICATION_TYPE.pickupReady]: 'pickupReady',
  [NOTIFICATION_TYPE.pickupExpiring]: 'pickupReady',
  [NOTIFICATION_TYPE.pickupExpired]: 'pickupReady',
  [NOTIFICATION_TYPE.queueMovedUp]: 'queueUpdates',
  [NOTIFICATION_TYPE.queuePositionChanged]: 'queueUpdates',
  [NOTIFICATION_TYPE.queueAddedByLibrarian]: 'queueUpdates',
  [NOTIFICATION_TYPE.queueRemovedByLibrarian]: 'queueUpdates',
  [NOTIFICATION_TYPE.queueCancelledOtherEdition]: 'queueUpdates',
  [NOTIFICATION_TYPE.returnConfirmed]: 'returnConfirmed',
  [NOTIFICATION_TYPE.finePaid]: 'returnConfirmed',
  [NOTIFICATION_TYPE.renewalDone]: 'returnConfirmed',
  [NOTIFICATION_TYPE.loanPickedUp]: 'returnConfirmed',
}

// Os avisos que o aluno não consegue desligar.
const ALWAYS_ON: readonly (keyof NotificationPrefs)[] = [
  'queueTurn',
  'overdueAndFines',
]

// O aluno quer receber avisos deste tipo? "Sua vez" e "Atraso e multa" sempre.
export function isTypeEnabled(
  type: NotificationType,
  prefs: NotificationPrefs,
): boolean {
  const preference = PREFERENCE_OF_TYPE[type]
  return ALWAYS_ON.includes(preference) || prefs[preference]
}

// O aparelho recebe push quando é Android, tem token e o Expo não o recusou.
export function hasPush(device: DeviceRecord): boolean {
  return (
    device.platform === 'android' &&
    Boolean(device.expoPushToken) &&
    !device.pushDisabledAt
  )
}

// O que fazer com o push: não enviar (`disabled`: o aluno desligou o canal ou o
// tipo; `unsupported`: nenhum aparelho Android com token que ainda vale, como no
// iPhone) ou enviar aos aparelhos listados.
export type PushPlan = { status: DeliveryStatus } | { devices: DeviceRecord[] }

export function pushPlan(
  type: NotificationType,
  prefs: NotificationPrefs,
  devices: readonly DeviceRecord[],
): PushPlan {
  if (!prefs.channelPush || !isTypeEnabled(type, prefs)) {
    return { status: DELIVERY_STATUS.disabled }
  }
  const reachable = devices.filter(hasPush)
  return reachable.length > 0
    ? { devices: reachable }
    : { status: DELIVERY_STATUS.unsupported }
}

// O e-mail sai? Só se o aluno não desligou o canal nem o tipo.
export function shouldEmail(
  type: NotificationType,
  prefs: NotificationPrefs,
): boolean {
  return prefs.channelEmail && isTypeEnabled(type, prefs)
}

// O resultado do push no aviso: `sent` se pelo menos um aparelho recebeu, senão
// `failed`.
export function pushDeliveryOf(
  tickets: readonly PushTicketStatus[],
): DeliveryStatus {
  return tickets.includes('ok') ? DELIVERY_STATUS.sent : DELIVERY_STATUS.failed
}
