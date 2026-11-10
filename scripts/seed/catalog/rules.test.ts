import { describe, expect, it } from 'vitest'
import type { CatalogArea } from './areas.js'
import {
  copyCountOf,
  cutterOf,
  matchesArea,
  MAX_COPIES_PER_TITLE,
  pickBrazilianIsbn,
  toCatalogBook,
} from './rules.js'

const AREA: CatalogArea = {
  key: 'computacao',
  label: 'Computação',
  cdu: '004',
  subjects: ['Computação', 'Programação'],
  queries: [],
  keywords: ['comput', 'program', 'software'],
  target: 1,
}

describe('pickBrazilianIsbn', () => {
  it('prefere o ISBN-13 de edição brasileira', () => {
    expect(
      pickBrazilianIsbn(['0132350882', '8576082675', '978-85-7608-267-5']),
    ).toBe('9788576082675')
  })

  it('aceita o ISBN-10 brasileiro quando não há ISBN-13', () => {
    expect(pickBrazilianIsbn(['0132350882', '857608267X'])).toBe('857608267X')
  })

  it('devolve null sem edição brasileira', () => {
    expect(pickBrazilianIsbn(['9780132350884', '0132350882'])).toBeNull()
  })
})

describe('copyCountOf', () => {
  it('fica sempre entre 1 e o máximo de exemplares por título', () => {
    for (let index = 0; index < 50; index++) {
      const count = copyCountOf(index)
      expect(count).toBeGreaterThanOrEqual(1)
      expect(count).toBeLessThanOrEqual(MAX_COPIES_PER_TITLE)
    }
  })
})

describe('cutterOf', () => {
  it('usa a inicial do sobrenome, três dígitos e a inicial do título sem artigo', () => {
    expect(cutterOf('Robert C. Martin', 'O Código Limpo')).toMatch(/^M\d{3}c$/)
  })

  it('aceita o formato "Sobrenome, Nome" e é sempre o mesmo para a mesma entrada', () => {
    const cutter = cutterOf('Assis, Machado de', 'Dom Casmurro')
    expect(cutter).toMatch(/^A\d{3}d$/)
    expect(cutterOf('Assis, Machado de', 'Dom Casmurro')).toBe(cutter)
  })
})

describe('matchesArea', () => {
  it('aceita pela palavra-chave no começo de uma palavra do título ou dos assuntos', () => {
    expect(matchesArea(AREA, 'Lógica de Programação', [])).toBe(true)
    expect(matchesArea(AREA, 'Clean Code', ['Computer software'])).toBe(true)
  })

  it('não aceita a palavra-chave no meio de outra palavra', () => {
    expect(matchesArea(AREA, 'Reprogramado', ['Romance'])).toBe(false)
  })
})

describe('toCatalogBook', () => {
  const base = {
    area: AREA,
    isbn: '9788576082675',
    sources: ['open_library' as const],
    index: 0,
    firstRegistration: 400001,
  }

  it('monta o livro com a capa, os assuntos e a CDU da área e os exemplares', () => {
    const book = toCatalogBook({
      ...base,
      metadata: {
        title: 'Código Limpo',
        authors: ['Robert C. Martin'],
        publisher: 'Alta Books',
        year: 2011,
        subjects: ['Computer software', 'Programação'],
        coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      },
      openLibraryKey: '/books/OL1M',
    })

    expect(book).toMatchObject({
      key: 'acervo_9788576082675',
      workId: 'codigo-limpo--martin',
      cdu: '004',
      subjects: ['Computação', 'Programação'],
      coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      metadataSources: ['open_library'],
      openLibraryKey: '/books/OL1M',
      copies: [{ registration: '400001' }, { registration: '400002' }],
    })
  })

  it('descarta o livro que não é da área (ex.: romance na busca de Computação)', () => {
    expect(
      toCatalogBook({
        ...base,
        metadata: {
          title: 'Duna',
          authors: ['Frank Herbert'],
          subjects: ['Ficção científica'],
          coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
        },
      }),
    ).toBeNull()
  })

  it('descarta o livro sem capa, sem autor ou com título longo demais', () => {
    const metadata = {
      title: 'Livro de programação',
      authors: ['Autor'],
      coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    }
    expect(
      toCatalogBook({
        ...base,
        metadata: { ...metadata, coverUrl: undefined },
      }),
    ).toBeNull()
    expect(
      toCatalogBook({ ...base, metadata: { ...metadata, authors: [] } }),
    ).toBeNull()
    expect(
      toCatalogBook({
        ...base,
        metadata: { ...metadata, title: 'x'.repeat(121) },
      }),
    ).toBeNull()
  })
})
