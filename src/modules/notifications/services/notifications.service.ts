import { getDb } from '../../../config/firebase.js'
import * as notificationsRepository from '../repositories/notifications.repository.js'
import { toNotificationsResponse } from '../rules/notice-view.rules.js'
import type { NotificationsResponse } from '../notifications.types.js'

// Notificações dentro do app (RF-AVI-01).

// Os avisos mais novos do aluno, com quantos ainda não foram lidos.
export async function listMyNotifications(
  uid: string,
): Promise<NotificationsResponse> {
  return toNotificationsResponse(await notificationsRepository.listLatest(uid))
}

// Marca como lidos os avisos que ainda não foram. Sem avisos novos, nada muda.
export async function markAllRead(uid: string): Promise<void> {
  await getDb().runTransaction(async (tx) => {
    const notices = await notificationsRepository.listLatest(uid, tx)
    const at = new Date()
    for (const notice of notices.filter((item) => !item.readAt)) {
      notificationsRepository.markRead(tx, uid, notice.id, at)
    }
  })
}
