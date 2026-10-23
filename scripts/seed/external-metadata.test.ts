import { describe, expect, it, vi } from 'vitest'
import { LOOKUP_STATUS } from '../../src/modules/catalog/catalog.constants.js'
import type { BookMetadataLookup } from '../../src/modules/catalog/catalog.types.js'
import { SYNC_PAUSE_MS } from '../catalog-sync/run.js'
import { buildSeed } from './build.js'
import { enrichFromExternalSources } from './external-metadata.js'
import { loadHolidaysFile } from './holidays.js'

async function freshBooks() {
  const { books } = buildSeed({
    holidays: await loadHolidaysFile(2026),
    tokenSecret: 'test-secret',
    today: '2026-10-15',
  })
  return books
}

const now = new Date('2026-10-18T12:00:00Z')
const noSleep = vi.fn(async () => {})

const found: BookMetadataLookup = {
  status: LOOKUP_STATUS.found,
  sources: ['open_library', 'brasil_api'],
  openLibraryKey: '/books/OL1M',
  data: {
    publisher: 'Editora das fontes',
    synopsis: 'Sinopse das fontes.',
    coverUrl: 'https://covers.example/c.jpg',
  },
}

describe('complemento pelas fontes externas (enrichFromExternalSources)', () => {
  it('consulta cada livro com ISBN e completa só o que falta', async () => {
    const books = await freshBooks()
    const lookup = vi
      .fn<(isbn: string) => Promise<BookMetadataLookup>>()
      .mockResolvedValue(found)

    const result = await enrichFromExternalSources(books, now, lookup, noSleep)

    // Três livros têm ISBN: Código Limpo, Refatoração e Algoritmos (3ª).
    expect(result).toEqual({ enriched: 3, notFound: 0, failed: 0 })
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(lookup.mock.calls[0]![0]).toBe('9788576082675')

    // Os valores do seed ficam; os que faltam são completados; a capa vem da fonte.
    expect(books.book_codigo_limpo).toMatchObject({
      publisher: 'Alta Books',
      synopsis: 'Mostra como escrever código fácil de ler e de manter...',
      coverUrl: 'https://covers.example/c.jpg',
      externalMetadata: {
        sources: ['open_library', 'brasil_api'],
        openLibraryKey: '/books/OL1M',
        lastSyncedAt: now,
        found: true,
      },
    })
    expect(books.book_refatoracao).toMatchObject({
      publisher: 'Novatec',
      synopsis: 'Sinopse das fontes.',
    })
    expect(books.book_arquitetura_limpa!.coverUrl).toBeNull()
  })

  it('espera entre um livro e o seguinte, mas não antes do primeiro', async () => {
    const books = await freshBooks()
    const sleep = vi.fn(async () => {})

    await enrichFromExternalSources(books, now, async () => found, sleep)

    expect(sleep.mock.calls).toEqual([[SYNC_PAUSE_MS], [SYNC_PAUSE_MS]])
  })

  it('mantém os dados do seed quando nenhuma fonte acha o ISBN', async () => {
    const books = await freshBooks()
    const before = structuredClone(books.book_codigo_limpo)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await enrichFromExternalSources(
      books,
      now,
      async () => ({ status: LOOKUP_STATUS.notFound }),
      noSleep,
    )

    expect(result).toEqual({ enriched: 0, notFound: 3, failed: 0 })
    expect(books.book_codigo_limpo).toEqual(before)
    expect(books.book_codigo_limpo!.externalMetadata).toEqual({
      sources: [],
      lastSyncedAt: null,
      found: true,
    })
    expect(warn.mock.calls.flat().join(' ')).toMatch(/9788576082675/)
  })

  it('mantém os dados do seed quando as fontes não respondem, e segue em frente', async () => {
    const books = await freshBooks()
    const before = structuredClone(books.book_codigo_limpo)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lookup = vi.fn(
      async () => ({ status: LOOKUP_STATUS.unavailable }) as const,
    )

    const result = await enrichFromExternalSources(books, now, lookup, noSleep)

    expect(result).toEqual({ enriched: 0, notFound: 0, failed: 3 })
    expect(lookup).toHaveBeenCalledTimes(3)
    expect(books.book_codigo_limpo).toEqual(before)
  })
})
