import { getDb } from '../../../config/firebase.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import type {
  NotificationPrefsBody,
  NotificationPrefsResponse,
} from '../notifications.types.js'
import { toPrefsResponse } from '../rules/notice-view.rules.js'

// Liga e desliga avisos e canais (RF-AVI-03).

// Muda só as chaves enviadas e devolve as preferências. "Sua vez na fila" e "Atraso
// e multa" ficam sempre ligados (o schema já recusa `false` nelas).
export async function updateNotificationPrefs(
  uid: string,
  changes: NotificationPrefsBody,
): Promise<NotificationPrefsResponse> {
  return getDb().runTransaction(async (tx) => {
    const user = await usersRepository.findById(uid, tx)
    if (!user) throw new Error('Aluno da sessão não encontrado.')

    const defined = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    )
    const prefs = toPrefsResponse({ ...user.notificationPrefs, ...defined })
    usersRepository.setNotificationPrefs(tx, uid, prefs, new Date())
    return prefs
  })
}
