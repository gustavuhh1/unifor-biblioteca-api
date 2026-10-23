import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import {
  ACTIVE_QUEUE_STATUSES,
  QUEUE_ENTRY_STATUS,
  type QueueEntry,
  type QueueEntryRecord,
} from '../../../shared/types/index.js'

// Acesso ao Firestore da coleção queueEntries (seção 2.10). Toda função que grava
// recebe tx e deve ser chamada depois de todas as leituras da transação. As
// leituras aceitam tx opcional: com ele, a leitura entra na transação. A fila
// ativa de uma edição usa o índice (bookId, status, order) e a do aluno, o índice
// (studentUid, status, joinedAt).

const entries = () => getDb().collection(COLLECTIONS.queueEntries)

// Campos de data do documento que o Firestore devolve como Timestamp.
const ENTRY_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'joinedAt',
  'turnStartedAt',
  'confirmDeadline',
  'lastNotifiedAt',
  'endedAt',
] as const

// Converte o documento lido em QueueEntryRecord (com o id), trocando os
// Timestamps por Date.
function toRecord(snapshot: DocumentSnapshot): QueueEntryRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, ENTRY_DATE_FIELDS),
  } as unknown as QueueEntryRecord
}

// Gera o id de um lugar novo (ou de um grupo de edições), sem gravar nada.
export function newEntryId(): string {
  return entries().doc().id
}

// Lê um lugar na fila. Não devolve nada se ele não existir.
export async function findById(
  id: string,
  tx?: Transaction,
): Promise<QueueEntryRecord | undefined> {
  const snapshot = await readDocument(entries().doc(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// A fila ativa da edição (waiting e your_turn), na ordem real (menor `order`
// primeiro). É daqui que saem a posição e as pessoas na frente.
export async function listActiveByBook(
  bookId: string,
  tx?: Transaction,
): Promise<QueueEntryRecord[]> {
  const query = entries()
    .where('bookId', '==', bookId)
    .where('status', 'in', [...ACTIVE_QUEUE_STATUSES])
    .orderBy('order', 'asc')
  const result = await (tx ? tx.get(query) : query.get())
  return result.docs.map(toRecord)
}

// O 1º da fila: o lugar `waiting` de menor `order` da edição, se houver
// (RF-FIL-06). Quem já está na vez (your_turn) não é o próximo.
export async function findNextWaiting(
  bookId: string,
  tx: Transaction,
): Promise<QueueEntryRecord | undefined> {
  const result = await tx.get(
    entries()
      .where('bookId', '==', bookId)
      .where('status', '==', QUEUE_ENTRY_STATUS.waiting)
      .orderBy('order', 'asc')
      .limit(1),
  )
  const [doc] = result.docs
  return doc ? toRecord(doc) : undefined
}

// Os lugares ativos do aluno, dos mais antigos para os mais novos (Minhas filas,
// RF-FIL-08).
export async function listActiveByStudent(
  uid: string,
  tx?: Transaction,
): Promise<QueueEntryRecord[]> {
  const query = entries()
    .where('studentUid', '==', uid)
    .where('status', 'in', [...ACTIVE_QUEUE_STATUSES])
    .orderBy('joinedAt', 'asc')
  const result = await (tx ? tx.get(query) : query.get())
  return result.docs.map(toRecord)
}

// Os lugares ativos de um grupo de edições marcadas juntas (RF-FIL-04).
export async function listActiveByGroup(
  editionGroupId: string,
  tx: Transaction,
): Promise<QueueEntryRecord[]> {
  const result = await tx.get(
    entries()
      .where('editionGroupId', '==', editionGroupId)
      .where('status', 'in', [...ACTIVE_QUEUE_STATUSES]),
  )
  return result.docs.map(toRecord)
}

// Os ids dos lugares na vez cujo prazo de confirmar já passou de `at`
// (índice status + confirmDeadline). Quem chama confere cada um de novo dentro da
// própria transação (RF-FIL-07).
export async function listTurnIdsExpiredBefore(at: Date): Promise<string[]> {
  const result = await entries()
    .where('status', '==', QUEUE_ENTRY_STATUS.yourTurn)
    .where('confirmDeadline', '<', at)
    .get()
  return result.docs.map((doc) => doc.id)
}

// Grava um lugar novo (RF-FIL-02, RF-BAL-06).
export function create(tx: Transaction, id: string, entry: QueueEntry): void {
  tx.set(entries().doc(id), withoutUndefined(entry))
}

// Atualiza campos de um lugar (vez, saída, posição, aviso).
export function update(
  tx: Transaction,
  id: string,
  fields: Partial<QueueEntry>,
): void {
  tx.update(entries().doc(id), withoutUndefined(fields))
}
