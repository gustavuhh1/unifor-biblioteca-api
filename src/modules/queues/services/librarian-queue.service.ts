import { BOOK_STATUS } from '../../../shared/types/index.js'
import { bookNotFound } from '../../catalog/catalog.errors.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import type { LibrarianQueueResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { toLibrarianQueue } from '../rules/queue-view.rules.js'

// A fila de um livro para o bibliotecário (RF-BAL-06): a fila ativa da edição, na
// ordem real, com nome e matrícula de cada aluno. Livro inexistente ou removido do
// acervo é 404. Também é a resposta das ações de remover e reenviar, já com a
// mudança feita.
export async function getLibrarianQueue(
  bookId: string,
): Promise<LibrarianQueueResponse> {
  const book = await booksRepository.findById(bookId)
  if (!book || book.status !== BOOK_STATUS.active) throw bookNotFound()

  const queue = await queueEntriesRepository.listActiveByBook(bookId)
  return toLibrarianQueue(book, queue)
}
