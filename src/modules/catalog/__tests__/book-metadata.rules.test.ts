import { describe, expect, it } from 'vitest'
import { brasilApiBookSchema } from '../book-metadata/brasil-api.schemas.js'
import { openLibraryResponseSchema } from '../book-metadata/open-library.schemas.js'
import { LOOKUP_STATUS } from '../catalog.constants.js'
import type { BookMetadataLookup } from '../catalog.types.js'
import {
  applyMetadataLookup,
  combineLookups,
  externalMetadataOf,
} from '../rules/book-metadata.rules.js'
import { mapBrasilApiBook } from '../rules/brasil-api.rules.js'
import { mapOpenLibraryEntry } from '../rules/open-library.rules.js'
import { AT, makeBook } from './book.fixtures.js'
import {
  BRASIL_API_1984,
  NOT_FOUND,
  OPEN_LIBRARY_1984,
  UNAVAILABLE,
  foundBy,
} from './book-metadata.fixtures.js'

const LATER = new Date('2026-10-22T10:00:00Z')

// As duas respostas reais de 1984, já mapeadas como o cliente de cada fonte faz.
const openLibrary1984 = foundBy(
  mapOpenLibraryEntry(
    openLibraryResponseSchema.parse(OPEN_LIBRARY_1984)['ISBN:9788535914849']!,
  ),
  '/books/OL26449397M',
)
const brasilApi1984 = foundBy(
  mapBrasilApiBook(brasilApiBookSchema.parse(BRASIL_API_1984)),
)

describe('combinação das duas fontes (combineLookups)', () => {
  it('Open Library primeiro em título, autores, capa e assuntos; BrasilAPI traz a sinopse', () => {
    const lookup = combineLookups(openLibrary1984, brasilApi1984)

    expect(lookup).toMatchObject({
      status: LOOKUP_STATUS.found,
      sources: ['open_library', 'brasil_api'],
      openLibraryKey: '/books/OL26449397M',
      data: {
        title: '1984',
        // A BrasilAPI mistura os tradutores nos autores; vale a Open Library.
        authors: ['George Orwell'],
        coverUrl: 'https://covers.openlibrary.org/b/id/8172473-L.jpg',
        publisher: 'Companhia das Letras',
        year: 2009,
      },
    })
    const { data } = lookup as Extract<
      BookMetadataLookup,
      { status: typeof LOOKUP_STATUS.found }
    >
    expect(data.synopsis).toMatch(/^Publicada originalmente em 1949/)
    // Os assuntos são os da Open Library, limitados a 10.
    expect(data.subjects).toHaveLength(10)
  })

  it('a BrasilAPI preenche o campo que a Open Library deixou vazio', () => {
    const lookup = combineLookups(
      foundBy({ title: 'Título OL' }, '/books/OL1M'),
      foundBy({
        title: 'Título BR',
        publisher: 'Editora BR',
        year: 2001,
        synopsis: 'Sinopse BR',
        coverUrl: 'https://br.example/c.jpg',
      }),
    )

    expect(lookup).toEqual({
      status: LOOKUP_STATUS.found,
      sources: ['open_library', 'brasil_api'],
      openLibraryKey: '/books/OL1M',
      data: {
        title: 'Título OL',
        publisher: 'Editora BR',
        year: 2001,
        synopsis: 'Sinopse BR',
        coverUrl: 'https://br.example/c.jpg',
      },
    })
  })

  it('só a Open Library achou: usa ela (a BrasilAPI não conhece o ISBN de fora)', () => {
    const lookup = combineLookups(
      foundBy({ title: 'Clean Code' }, '/books/OL2M'),
      NOT_FOUND,
    )

    expect(lookup).toEqual({
      status: LOOKUP_STATUS.found,
      sources: ['open_library'],
      openLibraryKey: '/books/OL2M',
      data: { title: 'Clean Code' },
    })
  })

  it('só a BrasilAPI achou: usa ela, sem chave da Open Library', () => {
    const lookup = combineLookups(NOT_FOUND, foundBy({ title: 'Livro BR' }))

    expect(lookup).toEqual({
      status: LOOKUP_STATUS.found,
      sources: ['brasil_api'],
      data: { title: 'Livro BR' },
    })
  })

  it('uma fonte achou e a outra não respondeu: usa a que achou', () => {
    expect(combineLookups(UNAVAILABLE, foundBy({ title: 'A' }))).toMatchObject({
      status: LOOKUP_STATUS.found,
      sources: ['brasil_api'],
    })
    expect(combineLookups(foundBy({ title: 'A' }), UNAVAILABLE)).toMatchObject({
      status: LOOKUP_STATUS.found,
      sources: ['open_library'],
    })
  })

  it('nenhuma achou e as duas responderam: não encontrado', () => {
    expect(combineLookups(NOT_FOUND, NOT_FOUND)).toEqual({
      status: LOOKUP_STATUS.notFound,
    })
  })

  it('nenhuma achou e alguma não respondeu: indisponível, não "não encontrado"', () => {
    for (const [openLibrary, brasilApi] of [
      [UNAVAILABLE, NOT_FOUND],
      [NOT_FOUND, UNAVAILABLE],
      [UNAVAILABLE, UNAVAILABLE],
    ]) {
      expect(combineLookups(openLibrary!, brasilApi!)).toEqual({
        status: LOOKUP_STATUS.unavailable,
      })
    }
  })
})

describe('o que gravar em books.externalMetadata (externalMetadataOf)', () => {
  it('achou: as fontes, a chave da Open Library e a hora', () => {
    expect(
      externalMetadataOf(combineLookups(openLibrary1984, brasilApi1984), LATER),
    ).toEqual({
      sources: ['open_library', 'brasil_api'],
      openLibraryKey: '/books/OL26449397M',
      lastSyncedAt: LATER,
      found: true,
    })
  })

  it('achou só na BrasilAPI: não leva openLibraryKey', () => {
    const info = externalMetadataOf(
      combineLookups(NOT_FOUND, foundBy({ title: 'A' })),
      LATER,
    )

    expect(info).toEqual({
      sources: ['brasil_api'],
      lastSyncedAt: LATER,
      found: true,
    })
    expect(info).not.toHaveProperty('openLibraryKey')
  })

  it('não encontrado: found false, com a hora da consulta', () => {
    expect(
      externalMetadataOf({ status: LOOKUP_STATUS.notFound }, LATER),
    ).toEqual({ sources: [], lastSyncedAt: LATER, found: false })
  })

  it('indisponível: found false sem hora, porque ninguém respondeu', () => {
    expect(
      externalMetadataOf({ status: LOOKUP_STATUS.unavailable }, LATER),
    ).toEqual({ sources: [], lastSyncedAt: null, found: false })
  })
})

describe('combinação do salvo com as fontes (applyMetadataLookup)', () => {
  const saved = makeBook()

  // Resposta em que só a Open Library achou o livro.
  const foundLookup = (data: Parameters<typeof foundBy>[0]) =>
    combineLookups(foundBy(data, '/books/OL999M'), NOT_FOUND) as Extract<
      BookMetadataLookup,
      { status: typeof LOOKUP_STATUS.found }
    >

  it('troca só os campos permitidos e grava o externalMetadata com a hora real', () => {
    const { update, changedFields } = applyMetadataLookup(
      saved,
      foundLookup({
        title: 'Código Limpo 2',
        subtitle: 'novo subtítulo',
        authors: ['Robert Martin'],
        publisher: 'Outra Editora',
        year: 2024,
        synopsis: 'Nova sinopse',
        subjects: ['Software'],
        coverUrl: 'https://x.example/c.jpg',
      }),
      LATER,
    )

    expect(update).toMatchObject({
      title: 'Código Limpo 2',
      subtitle: 'novo subtítulo',
      authors: ['Robert Martin'],
      publisher: 'Outra Editora',
      year: 2024,
      synopsis: 'Nova sinopse',
      subjects: ['Software'],
      coverUrl: 'https://x.example/c.jpg',
      externalMetadata: {
        sources: ['open_library'],
        openLibraryKey: '/books/OL999M',
        lastSyncedAt: LATER,
        found: true,
      },
      updatedAt: LATER,
    })
    expect(changedFields).toEqual([
      'title',
      'subtitle',
      'authors',
      'publisher',
      'year',
      'synopsis',
      'coverUrl',
      'subjects',
    ])
  })

  it('nunca toca cdu, cutter, shelf, location, idioma, exemplares, contadores, workId nem status', () => {
    const { update } = applyMetadataLookup(
      saved,
      foundLookup({ title: 'Outro título', authors: ['Outro Autor'] }),
      LATER,
    )

    for (const field of [
      'cdu',
      'cutter',
      'shelf',
      'location',
      'language',
      'workId',
      'status',
      'copiesTotal',
      'copiesAvailable',
      'queueLength',
      'nextReturnAt',
      'unavailableForNewRequests',
      'isbn',
      'coverTone',
      'createdAt',
      'createdBy',
    ]) {
      expect(update).not.toHaveProperty(field)
    }
    expect({ ...saved, ...update }).toMatchObject({
      cdu: '005.1',
      cutter: 'M386c',
      shelf: 'Estante 005.1',
      language: 'Português',
      workId: 'codigo-limpo--martin',
      copiesTotal: 3,
    })
  })

  it('campo ausente na resposta das fontes não apaga o valor salvo', () => {
    const { update, changedFields } = applyMetadataLookup(
      saved,
      foundLookup({ title: 'Código Limpo', synopsis: 'Sinopse nova' }),
      LATER,
    )

    expect(changedFields).toEqual(['synopsis'])
    expect(update).not.toHaveProperty('publisher')
    expect(update).not.toHaveProperty('authors')
    expect(update).not.toHaveProperty('year')
    expect(update).not.toHaveProperty('subjects')
    expect(update).not.toHaveProperty('coverUrl')
  })

  it('não lista como mudado o campo que as fontes mandaram igual ao salvo', () => {
    const { changedFields } = applyMetadataLookup(
      saved,
      foundLookup({
        title: saved.title,
        authors: saved.authors,
        publisher: saved.publisher,
      }),
      LATER,
    )

    expect(changedFields).toEqual([])
  })

  it('refaz o texto de busca com os dados novos', () => {
    const { update } = applyMetadataLookup(
      saved,
      foundLookup({ title: 'Clean Code', subjects: ['Programming'] }),
      LATER,
    )

    expect(update.searchText).toBe(
      'clean code habilidades praticas do agile software robert c. martin programming 9788576082675',
    )
  })

  it('dataSource vira external se as fontes trouxeram título, autores, editora e sinopse', () => {
    const complete = applyMetadataLookup(
      saved,
      foundLookup({
        title: 'A',
        authors: ['B'],
        publisher: 'C',
        synopsis: 'D',
      }),
      LATER,
    )
    const partial = applyMetadataLookup(
      saved,
      foundLookup({ title: 'A', authors: ['B'], publisher: 'C' }),
      LATER,
    )

    expect(complete.update.dataSource).toBe('external')
    expect(partial.update.dataSource).toBe('mixed')
  })

  it('ISBN não encontrado só atualiza o externalMetadata e não altera mais nada', () => {
    const { update, changedFields } = applyMetadataLookup(
      saved,
      { status: LOOKUP_STATUS.notFound },
      LATER,
    )

    expect(update).toEqual({
      externalMetadata: { sources: [], lastSyncedAt: LATER, found: false },
      updatedAt: LATER,
    })
    expect(changedFields).toEqual([])
  })

  it('funciona também num livro que nunca foi consultado', () => {
    const { update } = applyMetadataLookup(
      makeBook({ externalMetadata: undefined }),
      { status: LOOKUP_STATUS.notFound },
      AT,
    )

    expect(update.externalMetadata).toEqual({
      sources: [],
      lastSyncedAt: AT,
      found: false,
    })
  })
})
