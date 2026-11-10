import type { BookRecord } from './types/index.js'

// A capa de um livro nas respostas que mostram o livro fora do acervo
// (empréstimos, filas e balcão): a imagem, quando houver, e o tom da capa gerada
// que o app usa sem imagem (design system, BookCover).
export interface BookCover {
  bookCoverUrl: string | null
  bookCoverTone: number
}

// Capas por id de livro.
export type BookCoverIndex = ReadonlyMap<string, BookCover>

// Tom da capa gerada de um livro que não está mais no acervo ativo.
export const FALLBACK_COVER_TONE = 1

// Monta o índice das capas a partir dos livros (o cache do acervo).
export function bookCoverIndexOf(
  books: readonly Pick<BookRecord, 'id' | 'coverUrl' | 'coverTone'>[],
): BookCoverIndex {
  return new Map(
    books.map((book) => [
      book.id,
      { bookCoverUrl: book.coverUrl ?? null, bookCoverTone: book.coverTone },
    ]),
  )
}

// A capa do livro pelo id. O livro removido do acervo (histórico) fica com a
// capa gerada.
export function bookCoverOf(bookId: string, covers: BookCoverIndex): BookCover {
  return (
    covers.get(bookId) ?? {
      bookCoverUrl: null,
      bookCoverTone: FALLBACK_COVER_TONE,
    }
  )
}
