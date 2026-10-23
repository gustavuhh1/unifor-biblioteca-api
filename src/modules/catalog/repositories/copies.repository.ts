import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import {
  COPY_STATUS,
  type Copy,
  type CopyRecord,
} from '../../../shared/types/index.js'

// Acesso ao Firestore da coleção copies (seção 2.8). Toda função que grava
// recebe tx e deve ser chamada depois de todas as leituras da transação.

const copies = () => getDb().collection(COLLECTIONS.copies)

// Campos de data do documento que o Firestore devolve como Timestamp.
const COPY_DATE_FIELDS = ['createdAt', 'updatedAt', 'dueAt'] as const

// Converte o documento lido em CopyRecord (com o id), trocando os Timestamps por
// Date.
function toRecord(snapshot: DocumentSnapshot): CopyRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, COPY_DATE_FIELDS),
  } as unknown as CopyRecord
}

// Gera o id de um exemplar novo, sem gravar nada.
export function newCopyId(): string {
  return copies().doc().id
}

// Lê os exemplares de um livro. Com tx, a leitura entra na transação.
export async function listByBook(
  bookId: string,
  tx?: Transaction,
): Promise<CopyRecord[]> {
  const query = copies().where('bookId', '==', bookId)
  const result = await (tx ? tx.get(query) : query.get())
  return result.docs.map(toRecord)
}

// Diz quais destes registros já existem no acervo (o registro é único, RF-GAC-02).
export async function findTakenRegistrations(
  tx: Transaction,
  registrations: readonly string[],
): Promise<Set<string>> {
  const taken = new Set<string>()
  const results = await Promise.all(
    [...new Set(registrations)].map((registration) =>
      tx.get(copies().where('registration', '==', registration).limit(1)),
    ),
  )
  for (const result of results) {
    for (const doc of result.docs) taken.add(doc.get('registration') as string)
  }
  return taken
}

// Grava um exemplar novo (cadastro, RF-GAC-02).
export function create(tx: Transaction, id: string, copy: Copy): void {
  tx.set(copies().doc(id), withoutUndefined(copy))
}

// Tira os exemplares do acervo (remoção do livro, RF-GAC-05): status withdrawn.
export function withdraw(
  tx: Transaction,
  ids: readonly string[],
  at: Date,
): void {
  for (const id of ids) {
    tx.update(copies().doc(id), {
      status: COPY_STATUS.withdrawn,
      updatedAt: at,
    })
  }
}
