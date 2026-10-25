import { getDb } from '../../../config/firebase.js'
import { folderNotFound } from '../saved.errors.js'
import type { FolderResponse, FoldersResponse } from '../saved.types.js'
import * as foldersRepository from '../repositories/folders.repository.js'
import * as savedBooksRepository from '../repositories/saved-books.repository.js'
import { folderIdsWithout } from '../rules/folder-membership.rules.js'
import { toFolderResponse } from '../rules/saved-view.rules.js'

// Pastas de Salvos do aluno (RF-SAL-02).

// As pastas, da mais antiga para a mais nova, e quantos livros há em "Todos os
// salvos".
export async function listFolders(uid: string): Promise<FoldersResponse> {
  const [folders, savedCount] = await Promise.all([
    foldersRepository.listAll(uid),
    savedBooksRepository.count(uid),
  ])
  return { savedCount, items: folders.map(toFolderResponse) }
}

// Cria uma pasta vazia. O nome já chegou validado (1 a 30 caracteres).
export async function createFolder(
  uid: string,
  name: string,
): Promise<FolderResponse> {
  const id = foldersRepository.newId(uid)
  const at = new Date()
  const folder = { name, bookCount: 0, createdAt: at, updatedAt: at }
  await getDb().runTransaction(async (tx) => {
    foldersRepository.create(tx, uid, id, folder)
  })
  return toFolderResponse({ id, ...folder })
}

// Renomeia a pasta. Pasta que não existe é 404.
export async function renameFolder(
  uid: string,
  folderId: string,
  name: string,
): Promise<FolderResponse> {
  return getDb().runTransaction(async (tx) => {
    const folder = await foldersRepository.findById(uid, folderId, tx)
    if (!folder) throw folderNotFound()

    const fields = { name, updatedAt: new Date() }
    foldersRepository.update(tx, uid, folderId, fields)
    return toFolderResponse({ ...folder, ...fields })
  })
}

// Apaga a pasta. Os livros dela não saem de "Todos os salvos": só perdem a ligação
// com a pasta. Pasta que não existe é 404.
export async function deleteFolder(
  uid: string,
  folderId: string,
): Promise<void> {
  await getDb().runTransaction(async (tx) => {
    const folder = await foldersRepository.findById(uid, folderId, tx)
    if (!folder) throw folderNotFound()
    const saved = await savedBooksRepository.listByFolderInTransaction(
      tx,
      uid,
      folderId,
    )

    const at = new Date()
    for (const book of saved) {
      savedBooksRepository.update(tx, uid, book.id, {
        folderIds: folderIdsWithout(book.folderIds, folderId),
        updatedAt: at,
      })
    }
    foldersRepository.remove(tx, uid, folderId)
  })
}
