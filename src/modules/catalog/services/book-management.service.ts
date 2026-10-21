import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { workIdOf } from '../../../shared/work-id.js'
import {
  AUDIT_ACTION,
  BOOK_STATUS,
  COPY_STATUS,
  type BookRecord,
} from '../../../shared/types/index.js'
import {
  bookInCirculation,
  bookNotFound,
  isGoogleBooksUnavailable,
  registrationTaken,
} from '../catalog.errors.js'
import type {
  Actor,
  BookRecordResponse,
  CreateBookBody,
  GoogleBookData,
  UpdateBookBody,
} from '../catalog.types.js'
import * as googleBooksClient from '../google-books/google-books.client.js'
import * as booksRepository from '../repositories/books.repository.js'
import * as copiesRepository from '../repositories/copies.repository.js'
import * as worksRepository from '../repositories/works.repository.js'
import { toBookRecordResponse } from '../rules/book-response.rules.js'
import { canRemoveBook } from '../rules/book-removal.rules.js'
import { applyBookUpdate, applyToBook } from '../rules/book-update.rules.js'
import { registrationConflicts } from '../rules/copies.rules.js'
import { dataSourceForNewBook } from '../rules/data-source.rules.js'
import {
  buildNewBook,
  buildNewCopy,
  googleBooksInfoForNewBook,
} from '../rules/new-book.rules.js'

// Confere o volume do Google Books que o app informou no cadastro, para saber se
// o bibliotecário alterou os dados à mão (books.dataSource). Se o Google falhar,
// o cadastro segue sem a conferência (RNF-CON-03): a origem fica "mixed".
async function verifyVolume(
  volumeId: string | undefined,
): Promise<GoogleBookData | undefined> {
  if (!volumeId) return undefined
  try {
    return await googleBooksClient.fetchVolume(volumeId)
  } catch (error) {
    if (isGoogleBooksUnavailable(error)) return undefined
    throw error
  }
}

// Cadastra um livro e os seus exemplares (RF-GAC-02). Numa transação: confere que
// nenhum registro de exemplar já existe, cria a obra (id = slug do título + "--"
// + sobrenome do primeiro autor) ou acrescenta a edição a ela, e grava o livro, os
// exemplares (todos disponíveis) e o auditLog book_create. Registro repetido, no
// banco ou no próprio corpo, é 409 com os campos.
export async function createBook(
  body: CreateBookBody,
  actor: Actor,
): Promise<BookRecordResponse> {
  const at = new Date()
  const workId = workIdOf(body.title, body.authors)
  const volume = await verifyVolume(body.volumeId)
  const dataSource = dataSourceForNewBook({
    hasVolumeId: body.volumeId !== undefined,
    volume,
    book: body,
  })
  const book = buildNewBook(body, {
    workId,
    createdBy: actor.uid,
    dataSource,
    googleBooks: googleBooksInfoForNewBook(body, at),
    at,
  })

  const bookId = booksRepository.newBookId()
  await getDb().runTransaction(async (tx) => {
    const taken = await copiesRepository.findTakenRegistrations(
      tx,
      body.copies.map((copy) => copy.registration),
    )
    const conflicts = registrationConflicts(body.copies, taken)
    if (conflicts.length > 0) throw registrationTaken(conflicts)
    const work = await worksRepository.findById(tx, workId)

    booksRepository.create(tx, bookId, book)
    if (work) worksRepository.addEdition(tx, workId, work, bookId, at)
    else worksRepository.create(tx, workId, body, bookId, at)
    for (const input of body.copies) {
      copiesRepository.create(
        tx,
        copiesRepository.newCopyId(),
        buildNewCopy(input, { bookId, workId, at }),
      )
    }
    writeAuditLog(
      tx,
      {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: AUDIT_ACTION.bookCreate,
        bookId,
        entityId: bookId,
        details: { copies: body.copies.length, dataSource },
      },
      at,
    )
    return Promise.resolve()
  })

  invalidateCatalogCache()
  return toBookRecordResponse({ id: bookId, ...book })
}

// Edita um livro (RF-GAC-03, RF-GAC-06). Só grava o que mudou; livro removido é
// 404. Marcar ou desmarcar "indisponível para novos pedidos" gera book_set_unavailable
// no auditLog; as demais mudanças geram book_update. Pedidos, empréstimos e filas
// existentes não mudam. Sem nenhuma mudança, nada é gravado.
export async function updateBook(
  bookId: string,
  patch: UpdateBookBody,
  actor: Actor,
): Promise<BookRecordResponse> {
  const at = new Date()
  const result = await getDb().runTransaction(async (tx) => {
    const book = await booksRepository.findById(bookId, tx)
    if (!book || book.status !== BOOK_STATUS.active) throw bookNotFound()

    const { update, changedFields, unavailableChanged } = applyBookUpdate(
      book,
      patch,
      actor.uid,
      at,
    )
    if (Object.keys(update).length === 0) return { book, changed: false }

    booksRepository.update(tx, bookId, update)
    const entry = {
      actorUid: actor.uid,
      actorRole: actor.role,
      bookId,
      entityId: bookId,
    }
    if (unavailableChanged) {
      writeAuditLog(
        tx,
        {
          ...entry,
          action: AUDIT_ACTION.bookSetUnavailable,
          details: { unavailable: patch.unavailableForNewRequests },
        },
        at,
      )
    }
    if (changedFields.length > 0) {
      writeAuditLog(
        tx,
        {
          ...entry,
          action: AUDIT_ACTION.bookUpdate,
          details: { fields: changedFields },
        },
        at,
      )
    }
    return { book: applyToBook<BookRecord>(book, update), changed: true }
  })

  if (result.changed) invalidateCatalogCache()
  return toBookRecordResponse(result.book)
}

// Remove um livro do acervo (RF-GAC-05). Só se nenhum exemplar estiver reservado
// ou emprestado e a fila estiver vazia; senão 409 com a sugestão de marcar como
// indisponível. Numa transação: livro `removed` (sem exemplares no acervo),
// exemplares `withdrawn`, obra com uma edição ativa a menos e auditLog
// book_remove. O histórico de empréstimos não é tocado.
export async function removeBook(bookId: string, actor: Actor): Promise<void> {
  const at = new Date()
  await getDb().runTransaction(async (tx) => {
    const book = await booksRepository.findById(bookId, tx)
    if (!book || book.status !== BOOK_STATUS.active) throw bookNotFound()
    const copies = await copiesRepository.listByBook(bookId, tx)
    const work = await worksRepository.findById(tx, book.workId)

    if (!canRemoveBook(book, copies)) throw bookInCirculation()

    booksRepository.markRemoved(tx, bookId, { removedBy: actor.uid, at })
    copiesRepository.withdraw(
      tx,
      copies
        .filter((copy) => copy.status !== COPY_STATUS.withdrawn)
        .map((copy) => copy.id),
      at,
    )
    if (work) worksRepository.removeEdition(tx, book.workId, work, at)
    writeAuditLog(
      tx,
      {
        actorUid: actor.uid,
        actorRole: actor.role,
        action: AUDIT_ACTION.bookRemove,
        bookId,
        entityId: bookId,
        details: { title: book.title },
      },
      at,
    )
    return Promise.resolve()
  })

  invalidateCatalogCache()
}
