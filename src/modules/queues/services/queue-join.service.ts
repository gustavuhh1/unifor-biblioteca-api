import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { displayNameOf } from '../../../shared/domain/user.js'
import { forbidden } from '../../../shared/errors.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  QUEUE_ORIGIN,
  USER_ROLE,
  USER_STATUS,
  type QueueEntry,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import { editionsMismatch, joinRefused } from '../queues.errors.js'
import type { JoinQueueBody, JoinQueueResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { areSameWork, checkJoinEdition } from '../rules/join.rules.js'
import { buildNewEntry } from '../rules/new-entry.rules.js'
import { nextOrderAtEnd } from '../rules/placement.rules.js'
import { toQueueEntryResponse } from '../rules/queue-view.rules.js'

// Entra na fila de uma ou mais edições do mesmo livro (RF-FIL-02, RF-FIL-03,
// RF-FIL-04). Numa transação, para cada edição marcada: confere as regras da seção
// 2.10 (livro ativo e não indisponível, sem empréstimo atrasado, sem exemplar
// disponível, ainda dentro das 7 filas contando uma por edição, sem lugar nem
// pedido nesta edição) e cria o lugar `waiting` no fim da fila. As edições marcadas
// juntas ganham o mesmo `editionGroupId`. `queueLength` de cada livro e
// `activeQueueCount` do aluno sobem. Nada é gravado se uma edição for recusada.
export async function joinQueue(
  uid: string,
  body: JoinQueueBody,
): Promise<JoinQueueResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const editionGroupId =
    body.bookIds.length > 1 ? queueEntriesRepository.newEntryId() : undefined
  const entryIds = body.bookIds.map(() => queueEntriesRepository.newEntryId())

  const created = await getDb().runTransaction(async (tx) => {
    const student = await usersRepository.findById(uid, tx)
    const circulation = await readStudentCirculation(uid, tx)
    const myEntries = await queueEntriesRepository.listActiveByStudent(uid, tx)
    const books = await Promise.all(
      body.bookIds.map((bookId) => booksRepository.findById(bookId, tx)),
    )
    const queues = await Promise.all(
      body.bookIds.map((bookId) =>
        queueEntriesRepository.listActiveByBook(bookId, tx),
      ),
    )

    if (
      !student ||
      student.role !== USER_ROLE.student ||
      student.status !== USER_STATUS.active
    ) {
      throw forbidden()
    }
    const editions = books.flatMap((book) => (book ? [book] : []))
    if (editions.length !== books.length) throw bookNotFound()
    if (!areSameWork(editions)) throw editionsMismatch()

    const activeQueueBookIds = new Set(myEntries.map((entry) => entry.bookId))
    for (const book of editions) {
      const check = checkJoinEdition({
        book,
        student: circulation,
        limits: settings,
        at,
        queueSlots: editions.length,
        activeQueueBookIds,
      })
      if (!check.allowed) throw joinRefused(check.reason)
    }

    const entries = editions.map((book, index): QueueEntry =>
      buildNewEntry({
        book,
        student: {
          uid,
          matricula: student.matricula,
          name: displayNameOf(student),
        },
        order: nextOrderAtEnd(queues[index] ?? []),
        origin: QUEUE_ORIGIN.student,
        editionGroupId,
        at,
      }),
    )

    entries.forEach((entry, index) => {
      queueEntriesRepository.create(tx, entryIds[index]!, entry)
      const book = editions[index]!
      booksRepository.update(tx, book.id, {
        queueLength: book.queueLength + 1,
        updatedAt: at,
      })
    })
    usersRepository.setActiveQueueCount(
      tx,
      uid,
      circulation.activeQueueCount + entries.length,
      at,
    )

    return entries.map((entry, index) =>
      toQueueEntryResponse(
        { id: entryIds[index]!, ...entry },
        (queues[index]?.length ?? 0) + 1,
      ),
    )
  })

  invalidateCatalogCache()
  return { items: created }
}
