import { describe, expect, it, vi } from 'vitest'
import { buildSeed } from './build.js'
import { enrichFromGoogleBooks } from './google-books.js'
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

function asFetch(mock: unknown) {
  return mock as typeof fetch
}

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
      asFetch(fetchMock),
      now,
      noSleep,
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

  it('retries a 503 with exponential backoff and then succeeds', async () => {
    const books = await freshBooks()
    const sleep = vi.fn(async () => {})
    let searchCalls = 0
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/volumes?q=isbn:') && searchCalls++ < 2) {
        return new Response('x', { status: 503 })
      }
      return volumeResponse(url)
    })

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      asFetch(fetchMock),
      now,
      sleep,
    )

    expect(result).toEqual({ enriched: 3, notFound: 0, failed: 0 })
    expect(sleep.mock.calls.slice(0, 2)).toEqual([[1000], [2000]])
  })

  it('repeats an empty search and keeps the documented data if it stays empty', async () => {
    const books = await freshBooks()
    const before = structuredClone(books.book_codigo_limpo)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => Response.json({ totalItems: 0 }))

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      asFetch(fetchMock),
      now,
      noSleep,
    )

    expect(result).toEqual({ enriched: 0, notFound: 3, failed: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(9)
    // Not a failure of the book: googleBooks stays as documented (found: true).
    expect(books.book_codigo_limpo).toEqual(before)
    expect(books.book_codigo_limpo!.googleBooks).toEqual({
      volumeId: null,
      lastSyncedAt: null,
      found: true,
    })
    expect(warn.mock.calls.flat().join(' ')).toMatch(/9788576082675/)
  })

  it('gives up after 4 attempts on a persistent error, keeping the local data and hiding the key', async () => {
    const books = await freshBooks()
    const before = structuredClone(books.book_codigo_limpo)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sleep = vi.fn(async () => {})
    const fetchMock = vi.fn(async () => new Response('x', { status: 503 }))

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      asFetch(fetchMock),
      now,
      sleep,
    )

    expect(result).toEqual({ enriched: 0, notFound: 0, failed: 3 })
    expect(fetchMock).toHaveBeenCalledTimes(12)
    expect(sleep.mock.calls.slice(0, 3)).toEqual([[1000], [2000], [4000]])
    expect(books.book_codigo_limpo).toEqual(before)
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toMatch(/HTTP 503/)
    expect(logged).not.toMatch(/dummy-key/)
  })

  it('does not retry an error that retrying cannot fix', async () => {
    const books = await freshBooks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => new Response('x', { status: 403 }))

    const result = await enrichFromGoogleBooks(
      books,
      'dummy-key',
      asFetch(fetchMock),
      now,
      noSleep,
    )

    expect(result.failed).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
