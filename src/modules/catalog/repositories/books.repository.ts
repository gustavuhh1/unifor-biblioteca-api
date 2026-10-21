import {
  FieldValue,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  optionalDate,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import {
  BOOK_STATUS,
  type Book,
  type BookRecord,
  type GoogleBooksInfo,
} from '../../../shared/types/index.js'
import { DELETE_FIELD } from '../rules/book-update.rules.js'

// Acesso ao Firestore da coleção books (seção 2.7). Toda função que recebe tx e
// grava deve ser chamada depois de todas as leituras da transação. As funções
// de leitura aceitam tx opcional: com ele, a leitura entra na transação.

const books = () => getDb().collection(COLLECTIONS.books)
const bookRef = (id: string) => books().doc(id)

// Campos de data do documento que o Firestore devolve como Timestamp.
const BOOK_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'nextReturnAt',
  'unavailableSetAt',
  'removedAt',
] as const

// Converte o documento lido em BookRecord (com o id), trocando os Timestamps por
// Date, inclusive o googleBooks.lastSyncedAt.
function toRecord(snapshot: DocumentSnapshot): BookRecord {
  const data = dataWithDates(snapshot, BOOK_DATE_FIELDS)
  const googleBooks = data.googleBooks as
    | (Omit<GoogleBooksInfo, 'lastSyncedAt'> & { lastSyncedAt?: unknown })
    | undefined
  return {
    id: snapshot.id,
    ...data,
    ...(googleBooks
      ? {
          googleBooks: {
            ...googleBooks,
            lastSyncedAt: optionalDate(googleBooks.lastSyncedAt),
          },
        }
      : {}),
  } as unknown as BookRecord
}

// Gera o id de um livro novo, sem gravar nada.
export function newBookId(): string {
  return books().doc().id
}

// Lê todos os livros ativos (a busca roda em memória sobre eles, seção 4.2).
export async function listActive(): Promise<BookRecord[]> {
  const result = await books().where('status', '==', BOOK_STATUS.active).get()
  return result.docs.map(toRecord)
}

// Lê um livro, ativo ou removido. Não devolve nada se ele não existir.
export async function findById(
  id: string,
  tx?: Transaction,
): Promise<BookRecord | undefined> {
  const snapshot = await readDocument(bookRef(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Grava um livro novo (cadastro, RF-GAC-02).
export function create(tx: Transaction, id: string, book: Book): void {
  tx.set(bookRef(id), withoutUndefined(book))
}

// Atualiza campos de um livro. DELETE_FIELD apaga o campo no Firestore.
export function update(
  tx: Transaction,
  id: string,
  fields: Record<string, unknown>,
): void {
  tx.update(
    bookRef(id),
    withoutUndefined(
      Object.fromEntries(
        Object.entries(fields).map(([field, value]) => [
          field,
          value === DELETE_FIELD ? FieldValue.delete() : value,
        ]),
      ),
    ),
  )
}

// Marca o livro como removido do acervo (RF-GAC-05): sem exemplares no acervo.
export function markRemoved(
  tx: Transaction,
  id: string,
  removal: { removedBy: string; at: Date },
): void {
  tx.update(bookRef(id), {
    status: BOOK_STATUS.removed,
    removedAt: removal.at,
    removedBy: removal.removedBy,
    copiesTotal: 0,
    copiesAvailable: 0,
    updatedAt: removal.at,
  })
}
