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

// O Google documenta 503 (backendFailed) e 429 como "tente de novo com espera".
const MAX_ATTEMPTS = 4
const BASE_DELAY_MS = 1000

class HttpError extends Error {
  constructor(readonly status: number) {
    // Só o status é informado: a URL leva a chave da API.
    super(`HTTP ${status}`)
  }
}

const isRetryable = (error: unknown) =>
  error instanceof HttpError
    ? error.status === 429 || error.status >= 500
    : error instanceof TypeError // falha de rede do fetch

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

// Quantos livros foram completados, não encontrados e com falha.
export interface EnrichResult {
  enriched: number
  notFound: number
  failed: number
}

// Completa capa, sinopse e editora dos livros que têm ISBN, com as duas
// requisições ao Google Books do RF-ACE-04: busca pelo ISBN e depois o volume.
//
// A API às vezes responde 200 sem itens para um ISBN que existe, então uma busca
// vazia é repetida antes de desistir. Se continuar vazia, ou se a API falhar, os
// dados locais (inclusive o `googleBooks` documentado) são mantidos
// (RNF-CON-03) e o seed segue em frente.
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
