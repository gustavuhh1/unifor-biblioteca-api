import { LOOKUP_STATUS, OPEN_LIBRARY_BASE_URL } from '../catalog.constants.js'
import type { SourceLookup } from '../catalog.types.js'
import { mapOpenLibraryEntry } from '../rules/open-library.rules.js'
import {
  fetchSource,
  logSourceFailure,
  type SourceClientOptions,
} from './fetch-source.js'
import { openLibraryResponseSchema } from './open-library.schemas.js'

const SOURCE_NAME = 'Open Library'

// Consulta o ISBN na Open Library (RF-ACE-04, RNF-CON-03): uma chamada a
// api/books?bibkeys=ISBN:{isbn}&jscmd=data. Nunca lança: ISBN desconhecido
// (objeto vazio) é "não encontrado"; rede, tempo esgotado, status que não é 2xx ou
// resposta fora do formato são "indisponível".
export async function lookupOpenLibrary(
  isbn: string,
  options: SourceClientOptions = {},
): Promise<SourceLookup> {
  const bibkey = `ISBN:${isbn}`
  const outcome = await fetchSource(
    SOURCE_NAME,
    `${OPEN_LIBRARY_BASE_URL}/api/books?bibkeys=${encodeURIComponent(bibkey)}&format=json&jscmd=data`,
    options,
  )
  if (outcome.kind === 'failed') return { status: LOOKUP_STATUS.unavailable }
  if (outcome.kind === 'status') {
    logSourceFailure(SOURCE_NAME, `HTTP ${outcome.status}`)
    return { status: LOOKUP_STATUS.unavailable }
  }

  const parsed = openLibraryResponseSchema.safeParse(outcome.body)
  if (!parsed.success) {
    logSourceFailure(SOURCE_NAME, 'resposta fora do formato')
    return { status: LOOKUP_STATUS.unavailable }
  }
  const entry = parsed.data[bibkey]
  if (!entry) return { status: LOOKUP_STATUS.notFound }
  return {
    status: LOOKUP_STATUS.found,
    data: mapOpenLibraryEntry(entry),
    ...(entry.key ? { openLibraryKey: entry.key } : {}),
  }
}
