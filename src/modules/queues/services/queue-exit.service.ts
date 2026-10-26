import type { Transaction } from 'firebase-admin/firestore'
import type { LoanSettings } from '../../../shared/firestore/settings.js'
import {
  QUEUE_ENTRY_STATUS,
  type BookRecord,
  type QueueEntryRecord,
} from '../../../shared/types/index.js'
import * as booksRepository from '../../catalog/repositories/books.repository.js'
import * as copiesRepository from '../../../shared/repositories/copies.repository.js'
import {
  applyCopyRelease,
  planCopyRelease,
  type CopyReleasePlan,
} from '../../loans/services/copy-release.service.js'
import type { QueueExitStatus } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { exitFields } from '../rules/queue-exit.rules.js'
import { movedUpAfterExit } from '../rules/moved-up.rules.js'
import { movedUpNotice } from '../rules/queue-notices.rules.js'

// Sair da fila ativa sem virar pedido (RF-FIL-05, RF-FIL-07, RF-FIL-04, RF-BAL-06):
// o aluno sai, perde a vez, o bibliotecário remove, ou outra edição do mesmo livro
// chega primeiro. É uma função só, em duas fases, porque a transação do Firestore
// exige todas as leituras antes de qualquer gravação:
//
//   1. planQueueExit  (leitura)  lê o livro e a fila ativa e, se era a vez do aluno,
//                                decide para onde o exemplar guardado vai;
//   2. applyQueueExit (gravação) tira o lugar da fila, faz o exemplar seguir e avisa
//                                quem estava atrás que subiu na fila.
//
// Quem chama grava o `activeQueueCount` do aluno e o aviso: o que muda é diferente
// em cada saída, e o aluno pode sair de várias filas na mesma transação.

// O que a fase de gravação precisa saber, decidido na fase de leitura.
export interface QueueExitPlan {
  entry: QueueEntryRecord
  book: BookRecord
  // A fila ativa da edição em ordem, com este lugar ainda nela: de quem está atrás
  // dele saem os avisos de "você subiu na fila".
  queue: QueueEntryRecord[]
  // Só quando o lugar estava na vez: para onde vai o exemplar guardado.
  release: CopyReleasePlan | undefined
}

// Fase 1 (leitura). Chame junto das outras leituras da transação, antes de gravar.
export async function planQueueExit(
  tx: Transaction,
  entry: QueueEntryRecord,
): Promise<QueueExitPlan> {
  const book = await booksRepository.findById(entry.bookId, tx)
  if (!book) throw new Error('Livro do lugar na fila não encontrado.')

  const queue = await queueEntriesRepository.listActiveByBook(entry.bookId, tx)
  const copy =
    entry.status === QUEUE_ENTRY_STATUS.yourTurn && entry.reservedCopyId
      ? await copiesRepository.findById(entry.reservedCopyId, tx)
      : undefined
  return {
    entry,
    book,
    queue,
    release: copy ? await planCopyRelease(tx, book, copy) : undefined,
  }
}

// Fase 2 (gravação): o lugar vira `exit.status` (com a hora e, se houver, o motivo
// e quem tirou), `queueLength` do livro cai 1 e, se era a vez do aluno, o
// exemplar guardado passa ao próximo da fila ou volta para a estante. Quem estava
// atrás recebe o aviso de que subiu na fila (menos quem ganhou a vez, que recebe
// "É a sua vez").
export function applyQueueExit(
  tx: Transaction,
  plan: QueueExitPlan,
  exit: { status: QueueExitStatus; reason?: string; endedBy?: string },
  at: Date,
  settings: Pick<LoanSettings, 'queueConfirmHours'>,
): void {
  const { entry, book, release } = plan
  queueEntriesRepository.update(
    tx,
    entry.id,
    exitFields(exit.status, at, {
      ...(exit.reason === undefined ? {} : { reason: exit.reason }),
      ...(exit.endedBy === undefined ? {} : { endedBy: exit.endedBy }),
    }),
  )
  booksRepository.update(tx, book.id, {
    queueLength: Math.max(0, book.queueLength - 1),
    updatedAt: at,
  })
  if (release) applyCopyRelease(tx, release, at, settings)
  const turnReceiver = release?.queueTarget?.entry.id
  notifyMovedUp(tx, plan.queue, entry.id, at, turnReceiver)
}

// Avisa quem estava atrás do lugar que saiu que subiu na fila, com a posição nova.
// `turnReceiver` é quem ganhou a vez nesta saída (já foi avisado). Quem chama
// grava depois de todas as leituras da transação. O lugar que vira pedido ao
// confirmar a vez também usa esta função.
export function notifyMovedUp(
  tx: Transaction,
  queue: readonly QueueEntryRecord[],
  exitedId: string,
  at: Date,
  turnReceiver?: string,
): void {
  const skip = new Set(turnReceiver ? [turnReceiver] : [])
  for (const { entry, position } of movedUpAfterExit(queue, exitedId, skip)) {
    notificationsRepository.create(
      tx,
      entry.studentUid,
      movedUpNotice(entry, position, at),
    )
  }
}
