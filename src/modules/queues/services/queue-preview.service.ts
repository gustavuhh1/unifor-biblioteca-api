import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { BOOK_STATUS } from '../../../shared/types/index.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import type { QueuePreviewResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { checkJoinEdition } from '../rules/join.rules.js'
import { toPreviewEdition } from '../rules/queue-view.rules.js'

// Prévia da fila antes de entrar (RF-FIL-01, RF-FIL-04): a edição pedida e as
// outras edições ativas do mesmo livro, cada uma com as pessoas na frente
// (os lugares waiting e your_turn da edição, contados na hora) e se o aluno pode
// entrar nela. A edição pedida vem primeiro; as outras, da mais nova para a mais
// antiga. Livro inexistente ou removido é 404. Não grava nada.
export async function previewQueue(
  uid: string,
  bookId: string,
): Promise<QueuePreviewResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const book = await booksRepository.findById(bookId)
  if (!book || book.status !== BOOK_STATUS.active) throw bookNotFound()

  const [siblings, circulation, myEntries] = await Promise.all([
    booksRepository.listActiveByWork(book.workId),
    readStudentCirculation(uid),
    queueEntriesRepository.listActiveByStudent(uid),
  ])
  const editions = [
    book,
    ...siblings
      .filter((edition) => edition.id !== book.id)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
  ]
  const activeQueueBookIds = new Set(myEntries.map((entry) => entry.bookId))

  const items = await Promise.all(
    editions.map(async (edition) => {
      const queue = await queueEntriesRepository.listActiveByBook(edition.id)
      const check = checkJoinEdition({
        book: edition,
        student: circulation,
        limits: settings,
        at,
        activeQueueBookIds,
      })
      return toPreviewEdition(
        edition,
        check,
        queue.length,
        activeQueueBookIds.has(edition.id),
      )
    }),
  )

  return {
    bookId: book.id,
    activeQueueCount: circulation.activeQueueCount,
    maxActiveQueues: settings.maxActiveQueues,
    editions: items,
  }
}
