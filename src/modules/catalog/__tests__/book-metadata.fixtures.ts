import { readFileSync } from 'node:fs'
import { LOOKUP_STATUS } from '../catalog.constants.js'
import type { BookMetadata, SourceLookup } from '../catalog.types.js'

// Respostas reais da Open Library e da BrasilAPI (23/10/2026), enxutas: só os
// campos que a API lê, com os valores originais. 9788535914849 é "1984" (a
// BrasilAPI traz a sinopse; a Open Library traz mais de cem assuntos) e
// 9780132350884 é "Clean Code" (só a Open Library; a BrasilAPI responde 400).
export function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  )
}

export const OPEN_LIBRARY_1984 = loadFixture('open-library-9788535914849')
export const BRASIL_API_1984 = loadFixture('brasil-api-9788535914849')
export const OPEN_LIBRARY_CLEAN_CODE = loadFixture('open-library-9780132350884')

// Resposta da BrasilAPI para um ISBN que ela recusa (HTTP 400).
export const BRASIL_API_BAD_REQUEST = {
  message: 'ISBN inválido',
  type: 'bad_request',
  name: 'BadRequestError',
}

// Resposta pronta de JSON, como o fetch devolve.
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// Resultado de uma fonte que achou o livro.
export const foundBy = (
  data: BookMetadata,
  openLibraryKey?: string,
): SourceLookup => ({
  status: LOOKUP_STATUS.found,
  data,
  ...(openLibraryKey ? { openLibraryKey } : {}),
})

// Resultados de uma fonte que não conhece o ISBN e de uma que não respondeu.
export const NOT_FOUND: SourceLookup = { status: LOOKUP_STATUS.notFound }
export const UNAVAILABLE: SourceLookup = { status: LOOKUP_STATUS.unavailable }
