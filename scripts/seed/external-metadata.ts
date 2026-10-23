import { LOOKUP_STATUS } from '../../src/modules/catalog/catalog.constants.js'
import type { BookMetadataLookup } from '../../src/modules/catalog/catalog.types.js'
import { externalMetadataOf } from '../../src/modules/catalog/rules/book-metadata.rules.js'
import { lookupBookMetadata } from '../../src/modules/catalog/services/book-metadata.service.js'
import { SYNC_PAUSE_MS } from '../catalog-sync/run.js'
import type { SeedData } from './build.js'

// Quantos livros foram completados, não encontrados e sem resposta das fontes.
export interface EnrichResult {
  enriched: number
  notFound: number
  failed: number
}

// Completa capa, sinopse e editora dos livros que têm ISBN com as fontes externas
// (Open Library e BrasilAPI, RF-ACE-04), só quando o seed roda com
// --with-external-metadata. Os dados do próprio seed têm prioridade: só preenche
// o que falta (a capa é a única que troca). ISBN que nenhuma fonte acha, ou fontes
// que não respondem, deixam os dados locais como estão (RNF-CON-03) e o seed
// segue em frente. Pausa entre um livro e outro para não sobrecarregar as APIs.
export async function enrichFromExternalSources(
  books: SeedData['books'],
  now: Date = new Date(),
  lookup: (isbn: string) => Promise<BookMetadataLookup> = lookupBookMetadata,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<EnrichResult> {
  const result: EnrichResult = { enriched: 0, notFound: 0, failed: 0 }

  let first = true
  for (const book of Object.values(books)) {
    if (!book.isbn) continue
    if (!first) await sleep(SYNC_PAUSE_MS)
    first = false

    const found = await lookup(book.isbn)
    if (found.status === LOOKUP_STATUS.unavailable) {
      result.failed++
      console.warn(
        `Fontes externas: ISBN ${book.isbn} sem resposta; mantendo os dados do seed.`,
      )
    } else if (found.status === LOOKUP_STATUS.notFound) {
      result.notFound++
      console.warn(
        `Fontes externas: ISBN ${book.isbn} não encontrado; mantendo os dados do seed.`,
      )
    } else {
      book.coverUrl = found.data.coverUrl ?? book.coverUrl
      book.publisher ??= found.data.publisher
      book.synopsis ??= found.data.synopsis
      book.externalMetadata = externalMetadataOf(found, now)
      result.enriched++
    }
  }
  return result
}
