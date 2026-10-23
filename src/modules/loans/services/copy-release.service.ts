import type { Transaction } from 'firebase-admin/firestore'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import {
  COPY_STATUS,
  type BookRecord,
  type CopyRecord,
} from '../../../shared/types/index.js'

// "O exemplar volta" (RF-EMP-05, RF-EMP-06, RF-BAL-04): quando um pedido é cancelado
// ou expira, ou quando o livro é devolvido, o exemplar vai para o 1º da fila ou, se
// não há fila, de volta para a estante. É uma função só, em duas fases, porque a
// transação do Firestore exige todas as leituras antes de qualquer gravação:
//
//   1. planCopyRelease  (leitura)  decide para onde o exemplar vai;
//   2. applyCopyRelease (gravação) faz o exemplar e o contador do livro mudarem.
//
// O cancelamento usa estas duas funções; o balcão (devolução) e a rotina de
// expiração vão usar as mesmas.

// Quem está na frente da fila do livro e recebe o exemplar (a vez dele, RF-FIL-06).
export interface QueueHandoffTarget {
  entryId: string
}

// PONTO DE EXTENSÃO DA FILA. A fila ainda não foi implementada (RF-FIL-*), então
// aqui nunca há 1º da fila e o exemplar sempre volta para a estante. Quando o módulo
// da fila existir, esta função passa a ler, dentro da transação, o 1º lugar
// `waiting` da edição (menor `order`), e applyCopyRelease passa a reservar o
// exemplar para ele (copies.reserved + reservedForQueueEntryId, lugar your_turn,
// confirmDeadline e aviso). Nada mais no cancelamento, na devolução e na expiração
// precisa mudar.
/* eslint-disable @typescript-eslint/no-unused-vars -- parâmetros do ponto de extensão */
export async function findQueueHandoffTarget(
  _tx: Transaction,
  _book: Pick<BookRecord, 'id' | 'queueLength'>,
): Promise<QueueHandoffTarget | undefined> {
  return undefined
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// O que a fase de gravação precisa saber, decidido na fase de leitura.
export interface CopyReleasePlan {
  book: BookRecord
  copy: CopyRecord
  // Quem recebe o exemplar; undefined = volta para a estante.
  queueTarget: QueueHandoffTarget | undefined
}

// Fase 1 (leitura): decide para onde o exemplar vai. Chame junto das outras
// leituras da transação, antes de gravar.
export async function planCopyRelease(
  tx: Transaction,
  book: BookRecord,
  copy: CopyRecord,
): Promise<CopyReleasePlan> {
  return { book, copy, queueTarget: await findQueueHandoffTarget(tx, book) }
}

// Fase 2 (gravação): faz o exemplar voltar. Para a estante: o exemplar fica
// `available`, sem empréstimo ligado, e `copiesAvailable` do livro sobe 1. Um
// exemplar que não está `reserved` (por exemplo, retirado do acervo) não é mexido.
export function applyCopyRelease(
  tx: Transaction,
  plan: CopyReleasePlan,
  at: Date,
): void {
  const { book, copy, queueTarget } = plan
  if (copy.status !== COPY_STATUS.reserved) return
  if (queueTarget) {
    throw new Error('A entrega do exemplar ao 1º da fila ainda não existe.')
  }

  copiesRepository.makeAvailable(tx, copy.id, at)
  booksRepository.update(tx, book.id, {
    copiesAvailable: book.copiesAvailable + 1,
    updatedAt: at,
  })
}
