import type { Transaction } from 'firebase-admin/firestore'
import type { LoanSettings } from '../../../shared/firestore/settings.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import {
  applyQueueHandoff,
  findQueueHandoffTarget,
  type QueueHandoffTarget,
} from '../../queues/services/queue-handoff.service.js'
import {
  COPY_STATUS,
  type BookRecord,
  type CopyRecord,
} from '../../../shared/types/index.js'

// "O exemplar volta" (RF-EMP-05, RF-EMP-06, RF-BAL-04, RF-FIL-05, RF-FIL-07): quando
// um pedido é cancelado ou expira, quando o livro é devolvido ou quando quem estava
// na vez sai da fila, o exemplar vai para o 1º da fila ou, se não há fila, de volta
// para a estante. É uma função só, em duas fases, porque a transação do Firestore
// exige todas as leituras antes de qualquer gravação:
//
//   1. planCopyRelease  (leitura)  decide para onde o exemplar vai;
//   2. applyCopyRelease (gravação) faz o exemplar e o contador do livro mudarem.
//
// Quem chama: o cancelamento do pedido (loan-cancel.service), a devolução do balcão
// (por onCopyReturned), a rotina que expira pedidos não retirados e as saídas da
// fila de quem estava na vez (módulo de filas). Com fila, o 1º lugar `waiting` da
// edição fica com o exemplar (a vez dele); sem fila, o exemplar volta à estante.

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

// Fase 2 (gravação): faz o exemplar voltar. Com fila, o exemplar fica guardado
// (`reserved`) para o 1º da fila, que passa a ter a vez e é avisado; sem fila, o
// exemplar fica `available`, sem empréstimo ligado, e `copiesAvailable` do livro
// sobe 1. Só mexe em exemplar reservado ou emprestado: um exemplar retirado do
// acervo, por exemplo, não é mexido.
export function applyCopyRelease(
  tx: Transaction,
  plan: CopyReleasePlan,
  at: Date,
  settings: Pick<LoanSettings, 'queueConfirmHours'>,
): void {
  const { book, copy, queueTarget } = plan
  if (
    copy.status !== COPY_STATUS.reserved &&
    copy.status !== COPY_STATUS.onLoan
  ) {
    return
  }
  if (queueTarget) {
    applyQueueHandoff(tx, queueTarget, copy.id, at, settings.queueConfirmHours)
    return
  }

  copiesRepository.makeAvailable(tx, copy.id, at)
  booksRepository.update(tx, book.id, {
    copiesAvailable: book.copiesAvailable + 1,
    updatedAt: at,
  })
}
