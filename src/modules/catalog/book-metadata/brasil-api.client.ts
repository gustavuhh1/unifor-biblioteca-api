import { BRASIL_API_BASE_URL, LOOKUP_STATUS } from '../catalog.constants.js'
import type { SourceLookup } from '../catalog.types.js'
import { mapBrasilApiBook } from '../rules/brasil-api.rules.js'
import { brasilApiBookSchema } from './brasil-api.schemas.js'
import {
  fetchSource,
  logSourceFailure,
  type SourceClientOptions,
} from './fetch-source.js'

const SOURCE_NAME = 'BrasilAPI'

// Respostas da BrasilAPI que dizem que o ISBN não existe ali: 404 (não achou) e
// 400 (ISBN que ela não aceita, como os de fora do Brasil).
const NOT_FOUND_STATUSES: readonly number[] = [400, 404]

// Consulta o ISBN na BrasilAPI (RF-ACE-04, RNF-CON-03): uma chamada a
// isbn/v1/{isbn}. Nunca lança: 404 e 400 são "não encontrado"; rede, tempo
// esgotado, outro status que não é 2xx ou resposta fora do formato são
// "indisponível".
export async function lookupBrasilApi(
  isbn: string,
  options: SourceClientOptions = {},
): Promise<SourceLookup> {
  const outcome = await fetchSource(
    SOURCE_NAME,
    `${BRASIL_API_BASE_URL}/isbn/v1/${encodeURIComponent(isbn)}`,
    options,
  )
  if (outcome.kind === 'failed') return { status: LOOKUP_STATUS.unavailable }
  if (outcome.kind === 'status') {
    if (NOT_FOUND_STATUSES.includes(outcome.status)) {
      return { status: LOOKUP_STATUS.notFound }
    }
    logSourceFailure(SOURCE_NAME, `HTTP ${outcome.status}`)
    return { status: LOOKUP_STATUS.unavailable }
  }

  const parsed = brasilApiBookSchema.safeParse(outcome.body)
  if (!parsed.success) {
    logSourceFailure(SOURCE_NAME, 'resposta fora do formato')
    return { status: LOOKUP_STATUS.unavailable }
  }
  return { status: LOOKUP_STATUS.found, data: mapBrasilApiBook(parsed.data) }
}
