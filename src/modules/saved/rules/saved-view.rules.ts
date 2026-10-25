import type {
  BookRecord,
  FolderRecord,
  SavedBookRecord,
} from '../../../shared/types/index.js'
import { toBookSummary } from '../../catalog/rules/book-response.rules.js'
import type { FolderResponse, SavedBookResponse } from '../saved.types.js'

// Como os Salvos aparecem nas respostas (RF-SAL-01 a RF-SAL-03).

// Um livro salvo: o card do acervo mais quando foi salvo e as pastas em que está.
export function toSavedBookResponse(
  book: BookRecord,
  saved: SavedBookRecord,
): SavedBookResponse {
  return {
    ...toBookSummary(book),
    savedAt: saved.savedAt.toISOString(),
    folderIds: saved.folderIds,
  }
}

// Junta cada salvo ao seu livro, na ordem dos salvos. Quem não está nos livros
// ativos (removido do acervo) fica de fora.
export function toSavedBookResponses(
  savedBooks: readonly SavedBookRecord[],
  activeBooks: readonly BookRecord[],
): SavedBookResponse[] {
  const byId = new Map(activeBooks.map((book) => [book.id, book]))
  return savedBooks.flatMap((saved) => {
    const book = byId.get(saved.bookId)
    return book ? [toSavedBookResponse(book, saved)] : []
  })
}

// Uma pasta com o nome e a contagem de livros.
export function toFolderResponse(folder: FolderRecord): FolderResponse {
  return { id: folder.id, name: folder.name, bookCount: folder.bookCount }
}
