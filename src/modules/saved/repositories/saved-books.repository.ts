import type {
  DocumentSnapshot,
  Query,
  Transaction,
} from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { userSubcollectionPath } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import type { SavedBook, SavedBookRecord } from '../../../shared/types/index.js'
import { SAVED_LIST_LIMIT } from '../saved.constants.js'

// Acesso ao Firestore dos livros salvos, users/{uid}/savedBooks (seção 2.12); o id
// do documento é o id do livro. Toda função que grava recebe tx e deve ser
// chamada depois de todas as leituras da transação.

const savedBooks = (uid: string) =>
  getDb().collection(userSubcollectionPath(uid, 'savedBooks'))

// Converte o documento lido em SavedBookRecord (com o id), trocando os Timestamps
// por Date.
function toRecord(snapshot: DocumentSnapshot): SavedBookRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, ['savedAt', 'createdAt', 'updatedAt']),
  } as unknown as SavedBookRecord
}

// Os salvos de uma pasta, ou todos quando não há pasta.
function inFolder(uid: string, folderId?: string): Query {
  const all = savedBooks(uid)
  return folderId ? all.where('folderIds', 'array-contains', folderId) : all
}

// Lê um livro salvo do aluno. Não devolve nada se ele não estiver salvo.
export async function findById(
  uid: string,
  bookId: string,
  tx?: Transaction,
): Promise<SavedBookRecord | undefined> {
  const snapshot = await readDocument(savedBooks(uid).doc(bookId), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Os livros salvos, os salvos há menos tempo primeiro (índice folderIds + savedAt
// quando há pasta). Sem pasta, é "Todos os salvos" (RF-SAL-01, RF-SAL-03).
export async function list(
  uid: string,
  folderId?: string,
): Promise<SavedBookRecord[]> {
  const result = await inFolder(uid, folderId)
    .orderBy('savedAt', 'desc')
    .limit(SAVED_LIST_LIMIT)
    .get()
  return result.docs.map(toRecord)
}

// Todos os salvos de uma pasta, dentro da transação que vai apagá-la (RF-SAL-02).
export async function listByFolderInTransaction(
  tx: Transaction,
  uid: string,
  folderId: string,
): Promise<SavedBookRecord[]> {
  const result = await tx.get(inFolder(uid, folderId))
  return result.docs.map(toRecord)
}

// Quantos livros há em "Todos os salvos".
export async function count(uid: string): Promise<number> {
  const result = await savedBooks(uid).count().get()
  return result.data().count
}

// Grava um livro salvo novo.
export function create(
  tx: Transaction,
  uid: string,
  bookId: string,
  saved: SavedBook,
): void {
  tx.set(savedBooks(uid).doc(bookId), withoutUndefined(saved))
}

// Atualiza campos de um livro salvo (as pastas em que está).
export function update(
  tx: Transaction,
  uid: string,
  bookId: string,
  fields: Partial<SavedBook>,
): void {
  tx.update(savedBooks(uid).doc(bookId), withoutUndefined(fields))
}

// Tira o livro de "Todos os salvos".
export function remove(tx: Transaction, uid: string, bookId: string): void {
  tx.delete(savedBooks(uid).doc(bookId))
}
