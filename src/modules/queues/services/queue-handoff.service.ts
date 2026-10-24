import type { Transaction } from 'firebase-admin/firestore'
import {
  type BookRecord,
  type QueueEntryRecord,
} from '../../../shared/types/index.js'
import * as copiesRepository from '../../catalog/repositories/copies.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { turnNotice } from '../rules/queue-notices.rules.js'
import { turnStartFields } from '../rules/turn.rules.js'

// A vez do 1º da fila (RF-FIL-06). Quando um exemplar volta (devolução, pedido
// expirado ou cancelado, quem estava na vez sai da fila), o 1º `waiting` da
// edição fica com ele. Quem chama é copy-release.service (módulo de empréstimos),
// em duas fases porque a transação do Firestore exige todas as leituras antes de
// qualquer gravação:
//
//   1. findQueueHandoffTarget (leitura)  acha o 1º da fila;
//   2. applyQueueHandoff      (gravação) guarda o exemplar para ele e o avisa.

// Quem recebe o exemplar: o 1º da fila da edição.
export interface QueueHandoffTarget {
  entry: QueueEntryRecord
}

// Fase 1 (leitura): acha o 1º da fila da edição (o `waiting` de menor `order`).
// Sem fila, não devolve nada e o exemplar volta para a estante.
export async function findQueueHandoffTarget(
  tx: Transaction,
  book: Pick<BookRecord, 'id'>,
): Promise<QueueHandoffTarget | undefined> {
  const entry = await queueEntriesRepository.findNextWaiting(book.id, tx)
  return entry ? { entry } : undefined
}

// Fase 2 (gravação): o exemplar fica `reserved` para o 1º da fila, que passa a
// `your_turn` com `confirmHours` horas corridas para confirmar, e recebe o aviso
// "É a sua vez" dentro do app. Chame depois de todas as leituras da transação.
export function applyQueueHandoff(
  tx: Transaction,
  target: QueueHandoffTarget,
  copyId: string,
  at: Date,
  confirmHours: number,
): void {
  const { entry } = target
  const fields = turnStartFields({ copyId, at, confirmHours })
  queueEntriesRepository.update(tx, entry.id, fields)
  copiesRepository.reserveForQueue(tx, copyId, entry.id, at)
  notificationsRepository.create(
    tx,
    entry.studentUid,
    turnNotice({ ...entry, confirmDeadline: fields.confirmDeadline }, at),
  )
}
