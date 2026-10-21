import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { AUDIT_ACTION, BOOK_STATUS } from '../../../shared/types/index.js'
import { bookNotFound, isbnRequired } from '../catalog.errors.js'
import type {
  Actor,
  GoogleBookLookupResponse,
  SyncGoogleResponse,
} from '../catalog.types.js'
import * as googleBooksClient from '../google-books/google-books.client.js'
import * as booksRepository from '../repositories/books.repository.js'
import { applyToBook } from '../rules/book-update.rules.js'
import { toBookRecordResponse } from '../rules/book-response.rules.js'
import { applyGoogleLookup } from '../rules/google-books.rules.js'

// Consulta um ISBN no Google Books para pré-preencher o cadastro (RF-GAC-02).
// Só consulta: não grava nada. ISBN desconhecido volta com found false; falha do
// Google sobe como 502 (o app deixa preencher à mão).
export async function lookupGoogleBook(
  isbn: string,
): Promise<GoogleBookLookupResponse> {
  const lookup = await googleBooksClient.lookupIsbn(isbn)
  return lookup.found
    ? { found: true, volumeId: lookup.volumeId, book: lookup.data }
    : { found: false, volumeId: null, book: null }
}

// Atualiza um livro pelo Google Books com o ISBN salvo (RF-GAC-04, RF-ACE-04).
// Livro sem ISBN é 422. A consulta ao Google vem antes de qualquer gravação: se
// ela falhar (502), o livro não muda. Depois, numa transação, combina os dados
// (só os campos permitidos), grava e registra book_sync_google no auditLog. O
// script de importação (RF-ACE-05) chama esta mesma função, com o ator "system".
export async function syncBookFromGoogle(
  bookId: string,
  actor: Actor,
): Promise<SyncGoogleResponse> {
  const saved = await booksRepository.findById(bookId)
  if (!saved || saved.status !== BOOK_STATUS.active) throw bookNotFound()
  if (!saved.isbn) throw isbnRequired()

  const lookup = await googleBooksClient.lookupIsbn(saved.isbn)

  const at = new Date()
  const result = await getDb().runTransaction(async (tx) => {
    const current = await booksRepository.findById(bookId, tx)
    if (!current || current.status !== BOOK_STATUS.active) throw bookNotFound()

    const { update, changedFields } = applyGoogleLookup(current, lookup, at)
    booksRepository.update(tx, bookId, update)
    writeAuditLog(
      tx,
      {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: AUDIT_ACTION.bookSyncGoogle,
        bookId,
        entityId: bookId,
        details: { found: lookup.found, changedFields },
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
