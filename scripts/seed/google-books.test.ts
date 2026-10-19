import { describe, expect, it, vi } from 'vitest'
import { buildSeed } from './build.js'
import { enrichFromGoogleBooks } from './google-books.js'
import { loadHolidaysFile } from './holidays.js'

async function freshBooks() {
  const { books } = buildSeed({
    holidays: await loadHolidaysFile(2026),
    tokenSecret: 'test-secret',
    simulatedNow: true,
  })
  return books
}

const now = new Date('2026-10-18T12:00:00Z')

function volumeResponse(url: string) {
  if (url.includes('/volumes?q=isbn:')) {
    return Response.json({ items: [{ id: 'vol-123' }] })
  }
  return Response.json({
    volumeInfo: {
      publisher: 'Editora do Google',
      description: 'Sinopse do Google.',
      imageLinks: { thumbnail: 'http://books.example/cover.jpg' },
    },
  })
}

describe('enrichFromGoogleBooks', () => {
  it('makes the two requests per ISBN and completes only what is missing', async () => {
    const books = await freshBooks()
    const fetchMock = vi.fn(async (url: string) => volumeResponse(url))

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      fetchMock as unknown as typeof fetch,
      now,
    )

    // Three books have an ISBN: Código Limpo, Refatoração and Algoritmos (3ª).
    expect(result).toEqual({ enriched: 3, notFound: 0, failed: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://www.googleapis.com/books/v1/volumes?q=isbn:9788576082675&key=dummy-key',
    )
    expect(fetchMock.mock.calls[1]![0]).toBe(
      'https://www.googleapis.com/books/v1/volumes/vol-123?key=dummy-key',
    )

    // Documented values stay; missing ones are completed; the cover becomes https.
    expect(books.book_codigo_limpo).toMatchObject({
      publisher: 'Alta Books',
      synopsis: 'Mostra como escrever código fácil de ler e de manter...',
      coverUrl: 'https://books.example/cover.jpg',
      googleBooks: { volumeId: 'vol-123', lastSyncedAt: now, found: true },
    })
    expect(books.book_refatoracao).toMatchObject({
      publisher: 'Novatec',
      synopsis: 'Sinopse do Google.',
    })
    expect(books.book_arquitetura_limpa!.coverUrl).toBeNull()
  })

  it('marks an ISBN the API does not know as not found', async () => {
    const books = await freshBooks()
    const fetchMock = vi.fn(async () => Response.json({ totalItems: 0 }))

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      fetchMock as unknown as typeof fetch,
      now,
    )

    expect(result.notFound).toBe(3)
    expect(books.book_codigo_limpo!.googleBooks).toEqual({
      volumeId: null,
      lastSyncedAt: now,
      found: false,
    })
  })

  it('keeps the local data when the API fails, without leaking the key', async () => {
    const books = await freshBooks()
    const before = structuredClone(books.book_codigo_limpo)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response('x', { status: 500 }))

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      fetchMock as unknown as typeof fetch,
      now,
    )

    expect(result.failed).toBe(3)
    expect(books.book_codigo_limpo).toEqual(before)
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toMatch(/HTTP 500/)
    expect(logged).not.toMatch(/dummy-key/)
  })
})
