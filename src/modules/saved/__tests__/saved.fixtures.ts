import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import { makeBook } from '../../catalog/__tests__/book.fixtures.js'
import type { BookRecord } from '../../../shared/types/index.js'

// Apoio dos testes de Salvos: o aluno, os livros e os documentos de savedBooks e
// folders no Firestore falso.

export const STUDENT = 'uid_lucas'

// Instante fixo dos testes de Salvos (21/10/2026, 15:00 UTC).
export const AT = new Date('2026-10-21T15:00:00Z')

// Grava um livro do acervo e devolve o registro.
export function putBook(
  db: FakeFirestore,
  id: string,
  overrides: Partial<BookRecord> = {},
): BookRecord {
  const book = makeBook({ id, ...overrides })
  const data: Record<string, unknown> = { ...book }
  delete data.id
  db.put('books', id, data)
  return book
}

// Grava um livro salvo do aluno.
export function putSaved(
  db: FakeFirestore,
  bookId: string,
  overrides: { savedAt?: Date; folderIds?: string[] } = {},
  uid: string = STUDENT,
): void {
  db.put(`users/${uid}/savedBooks`, bookId, {
    bookId,
    savedAt: AT,
    folderIds: [],
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  })
}

// Grava uma pasta do aluno.
export function putFolder(
  db: FakeFirestore,
  id: string,
  overrides: { name?: string; bookCount?: number; createdAt?: Date } = {},
  uid: string = STUDENT,
): void {
  db.put(`users/${uid}/folders`, id, {
    name: 'Ler depois',
    bookCount: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  })
}
