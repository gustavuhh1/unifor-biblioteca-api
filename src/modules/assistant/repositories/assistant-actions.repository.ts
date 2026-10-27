import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  toDate,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type {
  AssistantAction,
  AssistantActionRecord,
} from '../../../shared/types/index.js'

// Acesso ao Firestore das ações propostas pelo Assistente,
// users/{uid}/assistantActions (seção 2.17). O TTL em `expiresAt` apaga as
// vencidas, com até 24 horas de atraso: por isso quem lê sempre confere a data.

const actions = (uid: string) =>
  getDb().collection(userSubcollectionPath(uid, 'assistantActions'))

// Converte o documento lido em AssistantActionRecord (com o id), trocando os
// Timestamps por Date, inclusive o prazo de retirada dentro de `preview`.
function toRecord(snapshot: DocumentSnapshot): AssistantActionRecord {
  const data = dataWithDates(snapshot, ['expiresAt', 'createdAt', 'updatedAt'])
  const preview = (data.preview ?? {}) as Record<string, unknown>
  return {
    id: snapshot.id,
    ...data,
    preview: {
      ...preview,
      ...(preview.pickupDeadline === undefined
        ? {}
        : { pickupDeadline: toDate(preview.pickupDeadline) }),
    },
  } as unknown as AssistantActionRecord
}

// Grava uma ação proposta (ou bloqueada) e devolve o registro com o id.
export async function create(
  uid: string,
  action: AssistantAction,
): Promise<AssistantActionRecord> {
  const ref = actions(uid).doc()
  await ref.set(withoutUndefined(action))
  return { id: ref.id, ...action }
}

// Lê uma ação do aluno. Com tx, a leitura entra na transação. Não devolve nada se
// ela não existir.
export async function findById(
  uid: string,
  id: string,
  tx?: Transaction,
): Promise<AssistantActionRecord | undefined> {
  const snapshot = await readDocument(actions(uid).doc(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Lê várias ações do aluno de uma vez (as que existirem).
export async function findManyByIds(
  uid: string,
  ids: readonly string[],
): Promise<AssistantActionRecord[]> {
  const found = await Promise.all(ids.map((id) => findById(uid, id)))
  return found.filter((action) => action !== undefined)
}

// Atualiza campos da ação. Com tx, a escrita entra na transação.
export function update(
  uid: string,
  id: string,
  data: Partial<AssistantAction>,
  tx?: Transaction,
): Promise<unknown> | void {
  const ref = actions(uid).doc(id)
  const clean = withoutUndefined(data)
  if (tx) {
    tx.update(ref, clean)
    return
  }
  return ref.update(clean)
}
