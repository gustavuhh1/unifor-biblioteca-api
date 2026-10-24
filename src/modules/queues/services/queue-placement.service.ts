import type { Transaction } from 'firebase-admin/firestore'
import type { QueueEntryRecord } from '../../../shared/types/index.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import type { Placement } from '../rules/placement.rules.js'
import { positionChangedNotice } from '../rules/queue-notices.rules.js'

// O que a mudança de posição feita pelo bibliotecário (adicionar ou mover, RF-BAL-06
// e RF-BAL-07) grava além do lugar em si: os novos `order` dos outros lugares, se
// foi preciso renumerar a fila, e o aviso de posição mudada para quem desceu. Chame
// depois de todas as leituras da transação. `queue` é a fila ativa lida antes da
// mudança.
export function applyPlacementEffects(
  tx: Transaction,
  input: {
    placement: Placement
    queue: readonly QueueEntryRecord[]
    at: Date
  },
): void {
  const { placement, queue, at } = input
  for (const { entryId, order } of placement.renumbered) {
    queueEntriesRepository.update(tx, entryId, { order, updatedAt: at })
  }
  for (const moved of placement.movedDown) {
    const entry = queue.find((candidate) => candidate.id === moved.entryId)
    if (!entry) continue
    notificationsRepository.create(
      tx,
      entry.studentUid,
      positionChangedNotice(entry, moved.toPosition, at),
    )
  }
}
