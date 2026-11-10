import { describe, expect, it } from 'vitest'
import {
  bookCoverIndexOf,
  bookCoverOf,
  FALLBACK_COVER_TONE,
} from './book-cover.js'

describe('capa do livro fora do acervo', () => {
  const covers = bookCoverIndexOf([
    {
      id: 'book_a',
      coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      coverTone: 3,
    },
    { id: 'book_b', coverTone: 5 },
  ])

  it('devolve a imagem e o tom do livro do acervo', () => {
    expect(bookCoverOf('book_a', covers)).toEqual({
      bookCoverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      bookCoverTone: 3,
    })
  })

  it('livro sem imagem fica só com o tom da capa gerada', () => {
    expect(bookCoverOf('book_b', covers)).toEqual({
      bookCoverUrl: null,
      bookCoverTone: 5,
    })
  })

  it('livro removido do acervo fica com a capa gerada padrão', () => {
    expect(bookCoverOf('book_removido', covers)).toEqual({
      bookCoverUrl: null,
      bookCoverTone: FALLBACK_COVER_TONE,
    })
  })
})
