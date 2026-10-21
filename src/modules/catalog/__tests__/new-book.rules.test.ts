import { describe, expect, it } from 'vitest'
import { createBookBodySchema } from '../schemas/request.schemas.js'
import { coverToneOf } from '../rules/cover-tone.rules.js'
import { registrationConflicts } from '../rules/copies.rules.js'
import { normalizeIsbn } from '../rules/isbn.rules.js'
import {
  buildNewBook,
  buildNewCopy,
  googleBooksInfoForNewBook,
} from '../rules/new-book.rules.js'
import { AT } from './book.fixtures.js'

const body = createBookBodySchema.parse({
  isbn: '978-85-7608-267-5',
  title: 'Código Limpo',
  subtitle: 'habilidades práticas do agile software',
  authors: ['Robert C. Martin'],
  subjects: ['Desenvolvimento de software'],
  cdu: '005.1',
  cutter: 'M386c',
  shelf: 'Estante 005.1',
  copies: [
    { registration: '46122', libraryCode: '1163 · Biblioteca · Livros' },
    {
      registration: '223223',
      libraryCode: '1163 · Biblioteca · Livros',
      acquisitionYear: 2011,
    },
  ],
})

describe('normalização do ISBN (normalizeIsbn)', () => {
  it('tira hífens e espaços', () => {
    expect(normalizeIsbn('978-85-7608-267-5')).toBe('9788576082675')
    expect(normalizeIsbn(' 978 85 7608 267 5 ')).toBe('9788576082675')
  })
})

describe('cor da capa (coverToneOf)', () => {
  it('vai de 1 a 6', () => {
    for (const workId of [
      'codigo-limpo--martin',
      'refatoracao--fowler',
      'a',
      'algoritmos--cormen',
      'calculo-vol-1--stewart',
    ]) {
      const tone = coverToneOf(workId)
      expect(tone).toBeGreaterThanOrEqual(1)
      expect(tone).toBeLessThanOrEqual(6)
    }
  })

  it('é sempre a mesma para a mesma obra', () => {
    expect(coverToneOf('codigo-limpo--martin')).toBe(
      coverToneOf('codigo-limpo--martin'),
    )
  })

  it('varia entre obras diferentes', () => {
    const tones = new Set(
      Array.from({ length: 30 }, (_, i) => coverToneOf(`obra-${i}--autor`)),
    )

    expect(tones.size).toBeGreaterThan(3)
  })
})

describe('registro de exemplar duplicado (registrationConflicts)', () => {
  const copies = [
    { registration: '46122' },
    { registration: '223223' },
    { registration: '46122' },
  ]

  it('não acha conflito quando os registros são livres e diferentes', () => {
    expect(registrationConflicts(copies.slice(0, 2), new Set())).toEqual([])
  })

  it('aponta o registro que já existe no banco', () => {
    expect(
      registrationConflicts(copies.slice(0, 2), new Set(['223223'])),
    ).toEqual([
      {
        field: 'copies.1.registration',
        message: 'O registro 223223 já existe no acervo.',
      },
    ])
  })

  it('aponta o registro repetido no próprio corpo, na segunda ocorrência', () => {
    expect(registrationConflicts(copies, new Set())).toEqual([
      {
        field: 'copies.2.registration',
        message: 'O registro 46122 está repetido.',
      },
    ])
  })
})

describe('dados do Google Books do livro novo (googleBooksInfoForNewBook)', () => {
  it('com volumeId, grava o volume como encontrado', () => {
    expect(
      googleBooksInfoForNewBook(
        { isbn: '9788576082675', volumeId: 'vol1' },
        AT,
      ),
    ).toEqual({ volumeId: 'vol1', lastSyncedAt: AT, found: true })
  })

  it('com ISBN e sem volumeId, grava found false', () => {
    expect(
      googleBooksInfoForNewBook(
        { isbn: '9788576082675', volumeId: undefined },
        AT,
      ),
    ).toEqual({ volumeId: null, lastSyncedAt: null, found: false })
  })

  it('sem ISBN, omite', () => {
    expect(
      googleBooksInfoForNewBook({ isbn: undefined, volumeId: undefined }, AT),
    ).toBeUndefined()
  })
})

describe('documento do livro novo (buildNewBook)', () => {
  const book = buildNewBook(body, {
    workId: 'codigo-limpo--martin',
    createdBy: 'uid_ana',
    dataSource: 'manual',
    googleBooks: undefined,
    at: AT,
  })

  it('nasce ativo, sem fila e com os contadores dos exemplares', () => {
    expect(book).toMatchObject({
      status: 'active',
      copiesTotal: 2,
      copiesAvailable: 2,
      queueLength: 0,
      unavailableForNewRequests: false,
      createdBy: 'uid_ana',
      createdAt: AT,
      updatedAt: AT,
    })
  })

  it('usa o ISBN normalizado, os padrões e a cor derivada da obra', () => {
    expect(book).toMatchObject({
      isbn: '9788576082675',
      language: 'Português',
      materialType: 'Livro',
      location: 'Biblioteca (Praça Central)',
      coverUrl: null,
      coverTone: coverToneOf('codigo-limpo--martin'),
    })
  })

  it('monta o texto de busca', () => {
    expect(book.searchText).toBe(
      'codigo limpo habilidades praticas do agile software robert c. martin desenvolvimento de software 9788576082675',
    )
  })

  it('não leva campos opcionais sem valor para o documento', () => {
    expect(book.translators).toBeUndefined()
    expect(book.googleBooks).toBeUndefined()
  })
})

describe('documento do exemplar novo (buildNewCopy)', () => {
  it('nasce disponível, com o workId do livro e o formato padrão', () => {
    const copy = buildNewCopy(body.copies[0]!, {
      bookId: 'book1',
      workId: 'codigo-limpo--martin',
      at: AT,
    })

    expect(copy).toMatchObject({
      bookId: 'book1',
      workId: 'codigo-limpo--martin',
      registration: '46122',
      format: 'Impresso',
      libraryCode: '1163 · Biblioteca · Livros',
      status: 'available',
    })
  })
})
