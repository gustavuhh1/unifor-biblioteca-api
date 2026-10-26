import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type {
  NotificationDelivery,
  NotificationRecord,
  NotificationType,
  UserNotification,
} from '../../../shared/types/index.js'
import { enqueueDelivery } from '../delivery-batch.js'
import { NOTIFICATION_LIST_LIMIT } from '../notifications.constants.js'

// Acesso ao Firestore dos avisos dentro do app, users/{uid}/notifications (seção
// 2.14). Quem grava chama depois de todas as leituras da transação.

const notifications = (uid: string) =>
  getDb().collection(userSubcollectionPath(uid, 'notifications'))

// Converte o documento lido em NotificationRecord (com o id), trocando os
// Timestamps por Date.
function toRecord(snapshot: DocumentSnapshot): NotificationRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, ['readAt', 'createdAt', 'updatedAt']),
  } as unknown as NotificationRecord
}

// Grava um aviso novo para o usuário e o anota para a entrega por push e e-mail
// (que acontece depois que a transação termina). Devolve o id do aviso.
export function create(
  tx: Transaction,
  uid: string,
  notification: UserNotification,
): string {
  const ref = notifications(uid).doc()
  tx.set(ref, withoutUndefined(notification))
  enqueueDelivery({ uid, id: ref.id })
  return ref.id
}

// Lê um aviso do usuário. Não devolve nada se ele não existir.
export async function findById(
  uid: string,
  id: string,
): Promise<NotificationRecord | undefined> {
  const snapshot = await readDocument(notifications(uid).doc(id))
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Os avisos mais novos do usuário, até NOTIFICATION_LIST_LIMIT (RF-AVI-01). Com tx,
// a leitura entra na transação.
export async function listLatest(
  uid: string,
  tx?: Transaction,
): Promise<NotificationRecord[]> {
  const query = notifications(uid)
    .orderBy('createdAt', 'desc')
    .limit(NOTIFICATION_LIST_LIMIT)
  const result = await (tx ? tx.get(query) : query.get())
  return result.docs.map(toRecord)
}

// Já existe um aviso deste tipo para o empréstimo? (a rotina dos lembretes não
// repete o aviso de "último dia para retirar"). A leitura entra na transação.
export async function existsForLoan(
  tx: Transaction,
  uid: string,
  loanId: string,
  type: NotificationType,
): Promise<boolean> {
  const result = await tx.get(
    notifications(uid)
      .where('loanId', '==', loanId)
      .where('type', '==', type)
      .limit(1),
  )
  return result.docs.length > 0
}

// Marca o aviso como lido (RF-AVI-01).
export function markRead(
  tx: Transaction,
  uid: string,
  id: string,
  at: Date,
): void {
  tx.update(notifications(uid).doc(id), { readAt: at, updatedAt: at })
}

// Grava o resultado da entrega do aviso em cada canal (RF-AVI-02, RF-AVI-04).
export async function setDelivery(
  uid: string,
  id: string,
  delivery: NotificationDelivery,
  at: Date,
): Promise<void> {
  await notifications(uid).doc(id).update({ delivery, updatedAt: at })
}
