import { sendEmail } from '../../../shared/mail/email.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import {
  DELIVERY_STATUS,
  type DeliveryStatus,
  type DeviceRecord,
  type NotificationRecord,
  type User,
} from '../../../shared/types/index.js'
import type { PendingNotice } from '../delivery-batch.js'
import { sendPush } from '../push/expo-push.client.js'
import * as devicesRepository from '../repositories/devices.repository.js'
import * as notificationsRepository from '../repositories/notifications.repository.js'
import {
  pushDeliveryOf,
  pushPlan,
  shouldEmail,
} from '../rules/delivery.rules.js'
import { emailMessageOf, pushMessageOf } from '../rules/notice-message.rules.js'

// Entrega dos avisos por push e por e-mail (RF-AVI-02, RF-AVI-04). O aviso dentro
// do app já foi gravado na transação de quem o gerou e aparece sempre; aqui só se
// tenta os dois canais de fora e se grava o resultado em `delivery`. Falha de um
// canal nunca desfaz o aviso nem derruba a requisição.

// Um aviso recém-gravado ainda não foi entregue quando os dois canais estão
// `skipped` (o valor com que ele nasce).
function isPending(notice: NotificationRecord): boolean {
  return (
    notice.delivery.push === DELIVERY_STATUS.skipped &&
    notice.delivery.email === DELIVERY_STATUS.skipped
  )
}

// Push: nos aparelhos Android do aluno, se ele ligou o canal e o tipo. Token que o
// Expo recusa deixa o aparelho sem push até ele mandar um token novo.
async function deliverPush(
  uid: string,
  user: User,
  notice: NotificationRecord,
  devices: readonly DeviceRecord[],
  at: Date,
): Promise<DeliveryStatus> {
  const plan = pushPlan(notice.type, user.notificationPrefs, devices)
  if (!('devices' in plan)) return plan.status

  const targets = plan.devices
  const tickets = await sendPush(
    targets.map((device) => pushMessageOf(notice, device.expoPushToken!)),
  )
  await Promise.all(
    targets.map((device, index) =>
      tickets[index] === 'invalid_token'
        ? devicesRepository.disablePush(uid, device.id, at)
        : undefined,
    ),
  )
  return pushDeliveryOf(tickets)
}

// E-mail: no e-mail cadastrado, se o aluno ligou o canal e o tipo. No emulador sem
// chave o e-mail não sai e só o assunto vai para o console.
async function deliverEmail(
  user: User,
  notice: NotificationRecord,
): Promise<DeliveryStatus> {
  if (!shouldEmail(notice.type, user.notificationPrefs)) {
    return DELIVERY_STATUS.disabled
  }
  const result = await sendEmail(emailMessageOf(notice, user.email))
  if (result === 'sent') return DELIVERY_STATUS.sent
  if (result === 'console') {
    console.log(
      `[avisos] E-mail NÃO enviado (desenvolvimento): ${notice.title}`,
    )
    return DELIVERY_STATUS.skipped
  }
  return DELIVERY_STATUS.failed
}

// Entrega um aviso nos dois canais ao mesmo tempo e grava o resultado.
async function deliverNotice(
  uid: string,
  user: User,
  notice: NotificationRecord,
  devices: readonly DeviceRecord[],
): Promise<void> {
  const at = new Date()
  const [push, email] = await Promise.all([
    deliverPush(uid, user, notice, devices, at),
    deliverEmail(user, notice),
  ])
  await notificationsRepository.setDelivery(uid, notice.id, { push, email }, at)
}

// Entrega os avisos de um aluno. Aviso que não existe (transação desfeita) ou que
// já foi entregue é descartado.
async function deliverToUser(uid: string, ids: readonly string[]) {
  const [user, devices, found] = await Promise.all([
    usersRepository.findById(uid),
    devicesRepository.listByUser(uid),
    Promise.all(ids.map((id) => notificationsRepository.findById(uid, id))),
  ])
  if (!user) return
  const notices = found.filter(
    (notice): notice is NotificationRecord => !!notice && isPending(notice),
  )
  await Promise.all(
    notices.map((notice) => deliverNotice(uid, user, notice, devices)),
  )
}

// Entrega os avisos que a requisição gravou, agrupados por aluno. Nunca lança
// erro: o que falhar fica registrado no log e o aviso dentro do app segue valendo.
export async function deliverNotices(
  batch: readonly PendingNotice[],
): Promise<void> {
  const idsByUser = new Map<string, string[]>()
  for (const { uid, id } of batch) {
    idsByUser.set(uid, [...(idsByUser.get(uid) ?? []), id])
  }
  const results = await Promise.allSettled(
    [...idsByUser].map(([uid, ids]) => deliverToUser(uid, ids)),
  )
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(
        'Falha ao entregar um aviso:',
        result.reason instanceof Error
          ? result.reason.name
          : 'erro desconhecido',
      )
    }
  }
}
