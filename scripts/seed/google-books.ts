import { z } from 'zod'
import type { SeedData } from './build.js'

const BASE_URL = 'https://www.googleapis.com/books/v1'

const searchSchema = z.object({
  items: z.array(z.object({ id: z.string() })).optional(),
})

const volumeSchema = z.object({
  volumeInfo: z.object({
    publisher: z.string().optional(),
    description: z.string().optional(),
    imageLinks: z
      .object({
        thumbnail: z.string().optional(),
        smallThumbnail: z.string().optional(),
      })
      .optional(),
  }),
})

type Sleep = (ms: number) => Promise<void>
const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Google documents 503 (backendFailed) and 429 as "retry with backoff".
const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 1000

class HttpError extends Error {
  constructor(readonly status: number) {
    // Only the status is reported: the URL carries the API key.
    super(`HTTP ${status}`)
  }
}

const isRetryable = (error: unknown) =>
  error instanceof HttpError
    ? error.status === 429 || error.status >= 500
    : error instanceof TypeError // network failure from fetch

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  sleep: Sleep,
): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchImpl(url)
      if (!response.ok) throw new HttpError(response.status)
      return await response.json()
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))
    }
  }
}

export interface EnrichResult {
  enriched: number
  notFound: number
  failed: number
}

// Completes cover, synopsis and publisher of the books that have an ISBN, with
// the two Google Books requests of RF-ACE-04: search by ISBN, then the volume.
//
// The API sometimes answers 200 with no items for an ISBN that exists, so an
// empty search is repeated before giving up. If it stays empty, or if the API
// fails, the local data (including the documented `googleBooks`) is kept
// (RNF-CON-03) and the seed goes on.
export async function enrichFromGoogleBooks(
  books: SeedData['books'],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
  sleep: Sleep = wait,
): Promise<EnrichResult> {
  const result: EnrichResult = { enriched: 0, notFound: 0, failed: 0 }
  const key = `key=${encodeURIComponent(apiKey)}`

  for (const book of Object.values(books)) {
    if (!book.isbn) continue
    try {
      let volumeId: string | undefined
      for (let attempt = 1; !volumeId && attempt <= 3; attempt++) {
        if (attempt > 1) await sleep(BASE_DELAY_MS * attempt)
        const search = searchSchema.parse(
          await getJson(
            `${BASE_URL}/volumes?q=isbn:${book.isbn}&${key}`,
            fetchImpl,
            sleep,
          ),
        )
        volumeId = search.items?.[0]?.id
      }
      if (!volumeId) {
        result.notFound++
        console.warn(
          `Google Books: no result for ISBN ${book.isbn}; keeping the local data.`,
        )
        continue
      }

      const { volumeInfo } = volumeSchema.parse(
        await getJson(
          `${BASE_URL}/volumes/${volumeId}?${key}`,
          fetchImpl,
          sleep,
        ),
      )
      const cover =
        volumeInfo.imageLinks?.thumbnail ??
        volumeInfo.imageLinks?.smallThumbnail
      book.coverUrl = cover ? cover.replace(/^http:/, 'https:') : book.coverUrl
      book.publisher ??= volumeInfo.publisher
      book.synopsis ??= volumeInfo.description
      book.googleBooks = { volumeId, lastSyncedAt: now, found: true }
      result.enriched++
    } catch (error) {
      result.failed++
      const reason = error instanceof Error ? error.message : 'unknown error'
      console.warn(`Google Books: ISBN ${book.isbn} skipped (${reason}).`)
    }
  }
  return result
}
