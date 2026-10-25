import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type { Folder, FolderRecord } from '../../../shared/types/index.js'
import { FOLDER_LIST_LIMIT } from '../saved.constants.js'

// Acesso ao Firestore das pastas de Salvos, users/{uid}/folders (seção 2.13). Toda
// função que grava recebe tx e deve ser chamada depois de todas as leituras da
// transação.

const folders = (uid: string) =>
  getDb().collection(userSubcollectionPath(uid, 'folders'))

// Converte o documento lido em FolderRecord (com o id), trocando os Timestamps
// por Date.
function toRecord(snapshot: DocumentSnapshot): FolderRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, ['createdAt', 'updatedAt']),
  } as unknown as FolderRecord
}

// Gera o id de uma pasta nova, sem gravar nada.
export function newId(uid: string): string {
  return folders(uid).doc().id
}

// Lê uma pasta do aluno. Não devolve nada se ela não existir.
export async function findById(
  uid: string,
  folderId: string,
  tx?: Transaction,
): Promise<FolderRecord | undefined> {
  const snapshot = await readDocument(folders(uid).doc(folderId), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// As pastas do aluno, da mais antiga para a mais nova (RF-SAL-02).
export async function listAll(uid: string): Promise<FolderRecord[]> {
  const result = await folders(uid)
    .orderBy('createdAt', 'asc')
    .limit(FOLDER_LIST_LIMIT)
    .get()
  return result.docs.map(toRecord)
}

// Grava uma pasta nova.
export function create(
  tx: Transaction,
  uid: string,
  folderId: string,
  folder: Folder,
): void {
  tx.set(folders(uid).doc(folderId), withoutUndefined(folder))
}

// Atualiza campos de uma pasta (nome e contagem de livros).
export function update(
  tx: Transaction,
  uid: string,
  folderId: string,
  fields: Partial<Folder>,
): void {
  tx.update(folders(uid).doc(folderId), withoutUndefined(fields))
}

// Apaga uma pasta.
export function remove(tx: Transaction, uid: string, folderId: string): void {
  tx.delete(folders(uid).doc(folderId))
}
