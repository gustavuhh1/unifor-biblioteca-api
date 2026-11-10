import {
  bookCoverIndexOf,
  type BookCoverIndex,
} from '../../../shared/book-cover.js'
import { getCachedActiveBooks } from '../../../shared/catalog-cache.js'
import type { BookRecord } from '../../../shared/types/index.js'
import * as booksRepository from '../repositories/books.repository.js'

// As capas dos livros ativos, para as listas de empréstimo, fila e balcão
// mostrarem a capa do livro. Vêm do cache do acervo (RNF-DES-01): não há leitura
// a mais no Firestore por pedido.
export async function loadBookCovers(): Promise<BookCoverIndex> {
  return bookCoverIndexOf(
    await getCachedActiveBooks(booksRepository.listActive),
  )
}

// As capas só dos livros indicados, lidas direto no Firestore. Para a resposta de
// uma ação (pedir, renovar, retirar...): a ação acabou de invalidar o cache, e
// recarregar o acervo inteiro para mostrar um livro custaria uma leitura por livro.
export async function loadBookCoversOf(
  bookIds: readonly string[],
): Promise<BookCoverIndex> {
  const books = await Promise.all(
    [...new Set(bookIds)].map((id) => booksRepository.findById(id)),
  )
  return bookCoverIndexOf(
    books.filter((book): book is BookRecord => book !== undefined),
  )
}
