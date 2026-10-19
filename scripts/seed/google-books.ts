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

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url)
  // Only the status is reported: the URL carries the API key.
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export interface EnrichResult {
  enriched: number
  notFound: number
  failed: number
}

// Completes cover, synopsis and publisher of the books that have an ISBN, with
// the two Google Books requests of RF-ACE-04: search by ISBN, then the volume.
// A failure keeps the local data (RNF-CON-03) and never stops the seed.
export async function enrichFromGoogleBooks(
  books: SeedData['books'],
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<EnrichResult> {
  const result: EnrichResult = { enriched: 0, notFound: 0, failed: 0 }
  const key = `key=${encodeURIComponent(apiKey)}`

  for (const book of Object.values(books)) {
    if (!book.isbn) continue
    try {
      const search = searchSchema.parse(
        await getJson(
          `${BASE_URL}/volumes?q=isbn:${book.isbn}&${key}`,
          fetchImpl,
        ),
      )
      const volumeId = search.items?.[0]?.id
      if (!volumeId) {
        book.googleBooks = { volumeId: null, lastSyncedAt: now, found: false }
        result.notFound++
        continue
      }

      const { volumeInfo } = volumeSchema.parse(
        await getJson(`${BASE_URL}/volumes/${volumeId}?${key}`, fetchImpl),
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
