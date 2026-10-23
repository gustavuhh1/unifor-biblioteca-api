import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { AUDIT_ACTION, AUDIT_ACTOR_ROLE } from '../../../shared/types/index.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import {
  placementRefused,
  queueEntryNotActive,
  queueEntryNotFound,
  reasonRequired,
} from '../queues.errors.js'
import type { MoveEntryBody, QueueChangeResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import {
  PLACEMENT_DECISION,
  decidePlacement,
  planPlacement,
} from '../rules/placement.rules.js'
import { isActiveEntry } from '../rules/queue-exit.rules.js'
import { positionChangedNotice } from '../rules/queue-notices.rules.js'
import {
  movedDownUids,
  positionOf,
  toMovedDownResponse,
} from '../rules/queue-view.rules.js'
import { getLibrarianQueue } from './librarian-queue.service.js'
import { applyPlacementEffects } from './queue-placement.service.js'

// O bibliotecário muda a posição de um aluno na fila (RF-BAL-06, RF-BAL-07). Só
// move quem está `waiting`: quem está na vez não se move (turn_in_progress) e
// ninguém passa à frente dele (invalid_position); ficar onde já está é
// same_position. Para trás, ou sem passar ninguém, a mudança é feita direto. Passando
// à frente de outros, a primeira chamada (`confirmed: false`) não grava nada e
// devolve `applied: false` com quem desce; a segunda (`confirmed: true`) exige o
// `reason` (reason_required). Aplicada: o lugar ganha um `order` entre os vizinhos
// (a fila é renumerada só se não houver valor livre), o aluno movido e quem desceu
// recebem o aviso de posição mudada e o auditLog registra `queue_move` com
// `from`, `to` e `movedDown`.
export async function moveQueueEntry(
  librarianUid: string,
  entryId: string,
  body: MoveEntryBody,
): Promise<QueueChangeResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const outcome = await getDb().runTransaction(async (tx) => {
    const entry = await queueEntriesRepository.findById(entryId, tx)
    if (!entry) throw queueEntryNotFound()
    if (!isActiveEntry(entry)) throw queueEntryNotActive()
    const queue = await queueEntriesRepository.listActiveByBook(
      entry.bookId,
      tx,
    )

    const planned = planPlacement({ queue, entryId, position: body.position })
    if (!planned.ok) throw placementRefused(planned.refusal)
    const { placement } = planned
    const movedDown = toMovedDownResponse(placement.movedDown, queue)

    const decision = decidePlacement(placement, body)
    if (decision === PLACEMENT_DECISION.confirm) {
      return { applied: false as const, movedDown, bookId: entry.bookId }
    }
    if (decision === PLACEMENT_DECISION.reasonRequired) {
      throw reasonRequired(
        'Informe o motivo para passar o aluno à frente de outros.',
      )
    }

    queueEntriesRepository.update(tx, entry.id, {
      order: placement.order,
      updatedAt: at,
    })
    applyPlacementEffects(tx, { placement, queue, at })
    notificationsRepository.create(
      tx,
      entry.studentUid,
      positionChangedNotice(entry, placement.position, at),
    )
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.queueMove,
        targetUid: entry.studentUid,
        bookId: entry.bookId,
        entityId: entry.id,
        reason: body.reason,
        details: {
          from: positionOf(queue, entry.id),
          to: placement.position,
          movedDown: movedDownUids(placement.movedDown, queue),
        },
      },
      at,
    )
    return { applied: true as const, movedDown, bookId: entry.bookId }
  })

  const { bookId, ...change } = outcome
  if (!change.applied) return { ...change, queue: null }
  return { ...change, queue: await getLibrarianQueue(bookId) }
}
