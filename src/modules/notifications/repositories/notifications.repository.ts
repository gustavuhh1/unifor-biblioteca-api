import type { Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import { withoutUndefined } from '../../../shared/firestore/converters.js'
import type { UserNotification } from '../../../shared/types/index.js'

// Acesso ao Firestore dos avisos dentro do app, users/{uid}/notifications (seção
// 2.14). Hoje só grava: a lista, marcar como lidas e os canais (push e e-mail) são
// do módulo de notificações (RF-AVI-01 a RF-AVI-04). Quem grava chama depois de
// todas as leituras da transação.

// Grava um aviso novo para o usuário.
export function create(
  tx: Transaction,
  uid: string,
  notification: UserNotification,
): void {
  tx.set(
    getDb().collection(userSubcollectionPath(uid, 'notifications')).doc(),
    withoutUndefined(notification),
  )
}
