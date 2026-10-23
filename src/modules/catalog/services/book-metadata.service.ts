import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { AUDIT_ACTION, BOOK_STATUS } from '../../../shared/types/index.js'
import { lookupBrasilApi } from '../book-metadata/brasil-api.client.js'
import { lookupOpenLibrary } from '../book-metadata/open-library.client.js'
import { LOOKUP_STATUS } from '../catalog.constants.js'
import {
  bookMetadataUnavailable,
  bookNotFound,
  isbnRequired,
} from '../catalog.errors.js'
import type {
  Actor,
  BookMetadataLookup,
  BookMetadataLookupResponse,
  SyncBookResponse,
} from '../catalog.types.js'
import * as booksRepository from '../repositories/books.repository.js'
import { toBookRecordResponse } from '../rules/book-response.rules.js'
import { applyToBook } from '../rules/book-update.rules.js'
import {
  applyMetadataLookup,
  combineLookups,
} from '../rules/book-metadata.rules.js'

// Consulta o ISBN na Open Library e na BrasilAPI, as duas ao mesmo tempo, e
// combina as respostas (RF-ACE-04). Só consulta: não grava nada e não lança.
// Quem chama decide o que fazer com "indisponível". Só o cadastro e a atualização
// do livro chamam esta função, nunca a busca nem a página do livro (RNF-CON-03).
export async function lookupBookMetadata(
  isbn: string,
): Promise<BookMetadataLookup> {
  const [openLibrary, brasilApi] = await Promise.all([
    lookupOpenLibrary(isbn),
    lookupBrasilApi(isbn),
  ])
  return combineLookups(openLibrary, brasilApi)
}

// Consulta um ISBN para pré-preencher o cadastro (RF-GAC-02). Só consulta: não
// grava nada. ISBN que nenhuma fonte conhece volta com found false; se nenhuma
// achou e alguma não respondeu, sobe como 502 (o app deixa preencher à mão).
export async function lookupBookByIsbn(
  isbn: string,
): Promise<BookMetadataLookupResponse> {
  const lookup = await lookupBookMetadata(isbn)
  switch (lookup.status) {
    case LOOKUP_STATUS.found:
      return {
        found: true,
        sources: lookup.sources,
        openLibraryKey: lookup.openLibraryKey ?? null,
        book: lookup.data,
      }
    case LOOKUP_STATUS.notFound:
      return { found: false, sources: [], openLibraryKey: null, book: null }
    case LOOKUP_STATUS.unavailable:
      throw bookMetadataUnavailable()
  }
}

// Atualiza um livro pelas fontes externas com o ISBN salvo (RF-GAC-04,
// RF-ACE-04). Livro sem ISBN é 422. A consulta vem antes de qualquer gravação: se
// nenhuma fonte achou e alguma não respondeu (502), o livro não muda. Depois,
// numa transação, combina os dados (só os campos permitidos), grava e registra
// book_sync_external no auditLog. O script de importação (RF-ACE-05) chama esta
// mesma função, com o ator "system".
export async function syncBookMetadata(
  bookId: string,
  actor: Actor,
): Promise<SyncBookResponse> {
  const saved = await booksRepository.findById(bookId)
  if (!saved || saved.status !== BOOK_STATUS.active) throw bookNotFound()
  if (!saved.isbn) throw isbnRequired()

  const lookup = await lookupBookMetadata(saved.isbn)
  if (lookup.status === LOOKUP_STATUS.unavailable) {
    throw bookMetadataUnavailable()
  }

  const at = new Date()
  const result = await getDb().runTransaction(async (tx) => {
    const current = await booksRepository.findById(bookId, tx)
    if (!current || current.status !== BOOK_STATUS.active) throw bookNotFound()

    const { update, changedFields } = applyMetadataLookup(current, lookup, at)
    booksRepository.update(tx, bookId, update)
    writeAuditLog(
      tx,
      {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: AUDIT_ACTION.bookSyncExternal,
        bookId,
        entityId: bookId,
        details: {
          found: lookup.status === LOOKUP_STATUS.found,
          changedFields,
        },
      },
      at,
    )
    return { book: applyToBook(current, update), changedFields }
  })

  invalidateCatalogCache()
  return {
    book: toBookRecordResponse(result.book),
    changedFields: result.changedFields,
  }
}
