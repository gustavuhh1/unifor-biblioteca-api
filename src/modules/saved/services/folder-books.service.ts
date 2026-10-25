import { getDb } from '../../../config/firebase.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { bookNotSaved, folderNotFound } from '../saved.errors.js'
import type { SavedBookResponse } from '../saved.types.js'
import * as foldersRepository from '../repositories/folders.repository.js'
import * as savedBooksRepository from '../repositories/saved-books.repository.js'
import {
  folderIdsWith,
  folderIdsWithout,
} from '../rules/folder-membership.rules.js'
import { toSavedBookResponse } from '../rules/saved-view.rules.js'

// Livros dentro das pastas de Salvos (RF-SAL-03).

// Coloca um livro salvo na pasta. Pasta que não existe é 404; livro que não está
// em "Todos os salvos" é 409 (book_not_saved); livro removido do acervo é 404. Se o
// livro já estava na pasta, nada muda. A contagem da pasta sobe na mesma transação.
export async function addBookToFolder(
  uid: string,
  folderId: string,
  bookId: string,
): Promise<SavedBookResponse> {
  const book = await booksRepository.findActiveById(bookId)
  if (!book) throw bookNotFound()

  const saved = await getDb().runTransaction(async (tx) => {
    const [folder, current] = await Promise.all([
      foldersRepository.findById(uid, folderId, tx),
      savedBooksRepository.findById(uid, bookId, tx),
    ])
    if (!folder) throw folderNotFound()
    if (!current) throw bookNotSaved()
    if (current.folderIds.includes(folderId)) return current

    const at = new Date()
    const folderIds = folderIdsWith(current.folderIds, folderId)
    savedBooksRepository.update(tx, uid, bookId, { folderIds, updatedAt: at })
    foldersRepository.update(tx, uid, folderId, {
      bookCount: folder.bookCount + 1,
      updatedAt: at,
    })
    return { ...current, folderIds }
  })
  return toSavedBookResponse(book, saved)
}

// Tira um livro da pasta; ele continua em "Todos os salvos". Pasta que não existe
// é 404. Livro que não estava na pasta: nada muda. A contagem da pasta cai na
// mesma transação.
export async function removeBookFromFolder(
  uid: string,
  folderId: string,
  bookId: string,
): Promise<void> {
  await getDb().runTransaction(async (tx) => {
    const [folder, current] = await Promise.all([
      foldersRepository.findById(uid, folderId, tx),
      savedBooksRepository.findById(uid, bookId, tx),
    ])
    if (!folder) throw folderNotFound()
    if (!current?.folderIds.includes(folderId)) return

    const at = new Date()
    savedBooksRepository.update(tx, uid, bookId, {
      folderIds: folderIdsWithout(current.folderIds, folderId),
      updatedAt: at,
    })
    foldersRepository.update(tx, uid, folderId, {
      bookCount: Math.max(0, folder.bookCount - 1),
      updatedAt: at,
    })
  })
}
