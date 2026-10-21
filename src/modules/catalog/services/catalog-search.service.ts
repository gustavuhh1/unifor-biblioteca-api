import { getCachedActiveBooks } from '../../../shared/catalog-cache.js'
import type {
  BookRecordResponse,
  BookSummary,
  LibrarianListBooksQuery,
  ListBooksQuery,
  Page,
} from '../catalog.types.js'
import * as booksRepository from '../repositories/books.repository.js'
import {
  toBookRecordResponse,
  toBookSummary,
} from '../rules/book-response.rules.js'
import { paginate, searchBooks } from '../rules/catalog-search.rules.js'

// Livros ativos do cache em memória (RNF-DES-01); só recarrega do Firestore
// quando o cache venceu ou foi invalidado. Nunca chama o Google Books
// (RNF-CON-03).
const activeBooks = () => getCachedActiveBooks(booksRepository.listActive)

// Busca do aluno (RF-ACE-01): uma página de cards, ordenada por título.
export async function searchCatalog(
  query: ListBooksQuery,
): Promise<Page<BookSummary>> {
  const matches = searchBooks(await activeBooks(), { q: query.q })
  const page = paginate(matches, query.page, query.pageSize)
  return { ...page, items: page.items.map(toBookSummary) }
}

// Lista e busca do bibliotecário (RF-GAC-01): a mesma busca, com o filtro, e o
// registro completo de cada livro.
export async function searchLibrarianCatalog(
  query: LibrarianListBooksQuery,
): Promise<Page<BookRecordResponse>> {
  const matches = searchBooks(await activeBooks(), {
    q: query.q,
    filter: query.filter,
  })
  const page = paginate(matches, query.page, query.pageSize)
  return { ...page, items: page.items.map(toBookRecordResponse) }
}
