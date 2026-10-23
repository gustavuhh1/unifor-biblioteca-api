import { describe, expect, it } from 'vitest'
import { brasilApiBookSchema } from '../book-metadata/brasil-api.schemas.js'
import { openLibraryResponseSchema } from '../book-metadata/open-library.schemas.js'
import { MAX_METADATA_SUBJECTS } from '../catalog.constants.js'
import { mapBrasilApiBook } from '../rules/brasil-api.rules.js'
import { mapOpenLibraryEntry } from '../rules/open-library.rules.js'
import {
  BRASIL_API_1984,
  OPEN_LIBRARY_1984,
  OPEN_LIBRARY_CLEAN_CODE,
} from './book-metadata.fixtures.js'

const entryOf = (fixture: unknown, isbn: string) =>
  openLibraryResponseSchema.parse(fixture)[`ISBN:${isbn}`]!

describe('mapeamento da Open Library (mapOpenLibraryEntry)', () => {
  it('mapeia a resposta real de Clean Code', () => {
    const data = mapOpenLibraryEntry(
      entryOf(OPEN_LIBRARY_CLEAN_CODE, '9780132350884'),
    )

    expect(data).toEqual({
      title: 'Clean Code',
      subtitle: 'A Handbook of Agile Software Craftsmanship',
      authors: ['Robert C. Martin'],
      publisher: 'Prentice Hall',
      year: 2008,
      subjects: expect.arrayContaining(['Agile software development']),
      coverUrl: 'https://covers.openlibrary.org/b/id/15126503-L.jpg',
    })
    // A Open Library não traz sinopse nem idioma.
    expect(data).not.toHaveProperty('synopsis')
    expect(data).not.toHaveProperty('language')
  })

  it('limita os mais de cem assuntos da resposta real de 1984', () => {
    const entry = entryOf(OPEN_LIBRARY_1984, '9788535914849')
    expect(entry.subjects!.length).toBeGreaterThan(100)

    const data = mapOpenLibraryEntry(entry)

    expect(data.subjects).toHaveLength(MAX_METADATA_SUBJECTS)
    expect(data).toMatchObject({
      title: '1984',
      authors: ['George Orwell'],
      publisher: 'Companhia das Letras',
      year: 2009,
      coverUrl: 'https://covers.openlibrary.org/b/id/8172473-L.jpg',
    })
  })

  it('usa a capa média ou a pequena quando falta a grande, sempre em https', () => {
    expect(
      mapOpenLibraryEntry({ cover: { medium: 'http://x.example/m.jpg' } })
        .coverUrl,
    ).toBe('https://x.example/m.jpg')
    expect(
      mapOpenLibraryEntry({ cover: { small: 'https://x.example/s.jpg' } })
        .coverUrl,
    ).toBe('https://x.example/s.jpg')
  })

  it('pega a primeira editora e ignora autor ou assunto sem nome', () => {
    expect(
      mapOpenLibraryEntry({
        publishers: [{ name: 'Primeira' }, { name: 'Segunda' }],
        authors: [{ name: 'Ana' }, { name: null }, {}],
        subjects: [{ name: 'Software' }, {}],
      }),
    ).toEqual({
      publisher: 'Primeira',
      authors: ['Ana'],
      subjects: ['Software'],
    })
  })

  it('só traz o que a fonte mandou, sem campos vazios', () => {
    expect(mapOpenLibraryEntry({ title: 'Só o título', authors: [] })).toEqual({
      title: 'Só o título',
    })
    expect(mapOpenLibraryEntry({})).toEqual({})
  })
})

describe('mapeamento da BrasilAPI (mapBrasilApiBook)', () => {
  it('mapeia a resposta real de 1984, com a sinopse', () => {
    const data = mapBrasilApiBook(brasilApiBookSchema.parse(BRASIL_API_1984))

    expect(data).toEqual({
      title: '1984',
      authors: ['George Orwell', 'Alexandre Hubner', 'Heloisa Jahn'],
      publisher: 'Companhia das Letras',
      year: 2009,
      synopsis: expect.stringMatching(/^Publicada originalmente em 1949/),
      // O "Literatura" repetido da resposta entra uma vez só.
      subjects: ['Literatura'],
    })
    // subtitle e cover_url vieram null: não entram.
    expect(data).not.toHaveProperty('subtitle')
    expect(data).not.toHaveProperty('coverUrl')
    expect(data.synopsis).not.toMatch(/\n$/)
  })

  it('tira o HTML da sinopse e lê o ano em texto', () => {
    expect(
      mapBrasilApiBook({
        synopsis: '<p>Um <b>clássico</b>.</p>',
        year: '1949',
        cover_url: 'http://x.example/c.jpg',
      }),
    ).toEqual({
      synopsis: 'Um clássico.',
      year: 1949,
      coverUrl: 'https://x.example/c.jpg',
    })
  })

  it('só traz o que a fonte mandou, sem campos vazios', () => {
    expect(mapBrasilApiBook({ title: 'Só o título', subjects: null })).toEqual({
      title: 'Só o título',
    })
    expect(mapBrasilApiBook({})).toEqual({})
  })
})
