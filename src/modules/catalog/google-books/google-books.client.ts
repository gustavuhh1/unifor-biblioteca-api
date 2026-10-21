import type { ZodType } from 'zod'
import { env } from '../../../config/env.js'
import {
  GOOGLE_BOOKS_BASE_URL,
  GOOGLE_BOOKS_TIMEOUT_MS,
} from '../catalog.constants.js'
import { googleBooksUnavailable } from '../catalog.errors.js'
import type { GoogleBookData, GoogleLookup } from '../catalog.types.js'
import { mapVolumeInfo } from '../rules/google-books.rules.js'
import { volumeSchema, volumeSearchSchema } from './google-books.schemas.js'

// Cliente do Google Books (RF-ACE-04, RNF-CON-03), com o fetch do Node e duas
// chamadas: a busca por ISBN (volumes?q=isbn:{isbn}) e a consulta do volume
// (volumes/{volumeId}). Qualquer falha (rede, tempo esgotado, 4xx, 5xx, resposta
// fora do formato) vira google_books_unavailable. A URL leva a chave da API, por
// isso nunca vai para erro nem para log.

// Peças trocáveis do cliente, para os testes não usarem a rede.
export interface GoogleBooksOptions {
  fetchImpl?: typeof fetch
  apiKey?: string | undefined
  timeoutMs?: number
}

// Registra só o motivo (status ou nome do erro), sem URL nem mensagem de rede.
function logFailure(reason: string): void {
  console.warn(`Google Books indisponível (${reason}).`)
}

// Faz uma chamada GET ao Google Books e confere o formato da resposta.
async function getJson<T>(
  path: string,
  schema: ZodType<T>,
  options: GoogleBooksOptions,
): Promise<T> {
  const {
    fetchImpl = fetch,
    apiKey = env.GOOGLE_BOOKS_API_KEY,
    timeoutMs = GOOGLE_BOOKS_TIMEOUT_MS,
  } = options
  if (!apiKey) {
    logFailure('GOOGLE_BOOKS_API_KEY não definida')
    throw googleBooksUnavailable()
  }

  const separator = path.includes('?') ? '&' : '?'
  const url = `${GOOGLE_BOOKS_BASE_URL}/${path}${separator}key=${encodeURIComponent(apiKey)}`

  let response: Response
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    logFailure(error instanceof Error ? error.name : 'erro desconhecido')
    throw googleBooksUnavailable()
  }
  if (!response.ok) {
    logFailure(`HTTP ${response.status}`)
    throw googleBooksUnavailable()
  }

  try {
    return schema.parse(await response.json())
  } catch {
    logFailure('resposta fora do formato')
    throw googleBooksUnavailable()
  }
}

// Chamada 2: consulta o volume pelo id e devolve os dados já no formato do livro.
export async function fetchVolume(
  volumeId: string,
  options: GoogleBooksOptions = {},
): Promise<GoogleBookData> {
  const { volumeInfo } = await getJson(
    `volumes/${encodeURIComponent(volumeId)}`,
    volumeSchema,
    options,
  )
  return mapVolumeInfo(volumeInfo)
}

// Procura o ISBN no Google Books (chamada 1) e, se achar, consulta o primeiro
// volume (chamada 2). ISBN sem resultado (totalItems 0) volta como found false,
// que não é erro.
export async function lookupIsbn(
  isbn: string,
  options: GoogleBooksOptions = {},
): Promise<GoogleLookup> {
  const search = await getJson(
    `volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`,
    volumeSearchSchema,
    options,
  )
  const volumeId = search.totalItems === 0 ? undefined : search.items?.[0]?.id
  if (!volumeId) return { found: false }
  return { found: true, volumeId, data: await fetchVolume(volumeId, options) }
}
