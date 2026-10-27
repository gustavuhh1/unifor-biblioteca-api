import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import type {
  AssistantMessage,
  AssistantMessageRecord,
} from '../../../shared/types/index.js'

// Acesso ao Firestore da conversa com o Assistente,
// users/{uid}/assistantMessages (seção 2.16).

const messages = (uid: string) =>
  getDb().collection(userSubcollectionPath(uid, 'assistantMessages'))

// Converte o documento lido em AssistantMessageRecord (com o id).
function toRecord(snapshot: DocumentSnapshot): AssistantMessageRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, ['createdAt', 'updatedAt']),
  } as unknown as AssistantMessageRecord
}

// Grava uma mensagem da conversa e devolve o registro com o id.
export async function create(
  uid: string,
  message: AssistantMessage,
): Promise<AssistantMessageRecord> {
  const ref = messages(uid).doc()
  await ref.set(withoutUndefined(message))
  return { id: ref.id, ...message }
}

// As mensagens mais recentes da conversa, até `limit`, da mais antiga para a
// mais nova (a ordem em que a tela mostra).
export async function listLatest(
  uid: string,
  limit: number,
): Promise<AssistantMessageRecord[]> {
  const result = await messages(uid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return result.docs.map(toRecord).reverse()
}
