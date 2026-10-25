import { getDb } from '../../../config/firebase.js'
import { getCachedActiveBooks } from '../../../shared/catalog-cache.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { folderNotFound } from '../saved.errors.js'
import type { SavedBookResponse, SavedBooksResponse } from '../saved.types.js'
import * as foldersRepository from '../repositories/folders.repository.js'
import * as savedBooksRepository from '../repositories/saved-books.repository.js'
import {
  toSavedBookResponse,
  toSavedBookResponses,
} from '../rules/saved-view.rules.js'

// Livros salvos do aluno em "Todos os salvos" (RF-SAL-01).

// Lista os livros salvos, os salvos há menos tempo primeiro, com a
// disponibilidade de agora (RF-SAL-01, RF-SAL-03). Com folderId, só os da pasta;
// pasta que não existe é 404. Os livros vêm do cache do acervo (RNF-DES-01), e o
// que foi removido do acervo não aparece.
export async function listSaved(
  uid: string,
  folderId?: string,
): Promise<SavedBooksResponse> {
  if (folderId && !(await foldersRepository.findById(uid, folderId))) {
    throw folderNotFound()
  }
  const [saved, activeBooks] = await Promise.all([
    savedBooksRepository.list(uid, folderId),
    getCachedActiveBooks(booksRepository.listActive),
  ])
  return { items: toSavedBookResponses(saved, activeBooks) }
}

// Salva o livro em "Todos os salvos" (RF-SAL-01). Livro inexistente ou removido é
// 404. Salvar de novo um livro já salvo não muda nada: o app não precisa conferir
// antes.
export async function saveBook(
  uid: string,
  bookId: string,
): Promise<SavedBookResponse> {
  const book = await booksRepository.findActiveById(bookId)
  if (!book) throw bookNotFound()

  const saved = await getDb().runTransaction(async (tx) => {
    const current = await savedBooksRepository.findById(uid, bookId, tx)
    if (current) return current

    const at = new Date()
    const created = {
      bookId,
      savedAt: at,
      folderIds: [],
      createdAt: at,
      updatedAt: at,
    }
    savedBooksRepository.create(tx, uid, bookId, created)
    return { id: bookId, ...created }
  })
  return toSavedBookResponse(book, saved)
}

// Tira o livro de "Todos os salvos" (RF-SAL-01). Ele sai também de todas as pastas
// em que estava, e a contagem de cada pasta cai. Livro que não estava salvo: nada
// muda.
export async function unsaveBook(uid: string, bookId: string): Promise<void> {
  await getDb().runTransaction(async (tx) => {
    const saved = await savedBooksRepository.findById(uid, bookId, tx)
    if (!saved) return
    const folders = await Promise.all(
      saved.folderIds.map((id) => foldersRepository.findById(uid, id, tx)),
    )

    const at = new Date()
    for (const folder of folders) {
      if (!folder) continue
      foldersRepository.update(tx, uid, folder.id, {
        bookCount: Math.max(0, folder.bookCount - 1),
        updatedAt: at,
      })
    }
    savedBooksRepository.remove(tx, uid, bookId)
  })
}
