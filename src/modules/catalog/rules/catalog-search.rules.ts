import { searchTermsOf } from '../../../shared/search-text.js'
import { BOOK_STATUS, type BookRecord } from '../../../shared/types/index.js'
import { CATALOG_FILTER } from '../catalog.constants.js'
import type { CatalogFilter, Page } from '../catalog.types.js'

// Ordem alfabética do português do Brasil (acentos e cedilha no lugar certo).
const TITLE_COLLATOR = new Intl.Collator('pt-BR')

// Diz se o livro passa no filtro extra da lista do bibliotecário (RF-GAC-01).
function matchesFilter(book: BookRecord, filter: CatalogFilter): boolean {
  switch (filter) {
    case CATALOG_FILTER.noIsbn:
      return !book.isbn
    case CATALOG_FILTER.unavailable:
      return book.unavailableForNewRequests
    case CATALOG_FILTER.all:
      return true
  }
}

// Busca em memória (RF-ACE-01, RF-GAC-01, RNF-DES-01): fica com os livros ativos
// cujo `searchText` tem todos os termos de `q` (sem acento, sem diferenciar
// maiúsculas), passa pelo filtro extra e ordena por título. `q` vazio lista
// todos. Livro removido nunca entra; livro indisponível para novos pedidos
// entra. A mesma função serve a busca do aluno e a do bibliotecário.
export function searchBooks(
  books: readonly BookRecord[],
  options: { q: string; filter?: CatalogFilter },
): BookRecord[] {
  const terms = searchTermsOf(options.q)
  const filter = options.filter ?? CATALOG_FILTER.all
  return books
    .filter(
      (book) =>
        book.status === BOOK_STATUS.active &&
        terms.every((term) => book.searchText.includes(term)) &&
        matchesFilter(book, filter),
    )
    .sort((a, b) => TITLE_COLLATOR.compare(a.title, b.title))
}

// Recorta uma página (a primeira é a 1) e conta o total de páginas. Página além
// do fim vem com a lista vazia.
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): Page<T> {
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    totalPages: Math.ceil(items.length / pageSize),
  }
}
