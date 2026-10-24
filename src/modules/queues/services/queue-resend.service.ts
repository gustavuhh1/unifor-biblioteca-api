import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  QUEUE_ENTRY_STATUS,
} from '../../../shared/types/index.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import {
  queueEntryNotActive,
  queueEntryNotFound,
  resendNotYourTurn,
} from '../queues.errors.js'
import type { LibrarianQueueResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { isActiveEntry } from '../rules/queue-exit.rules.js'
import { turnNotice } from '../rules/queue-notices.rules.js'
import { getLibrarianQueue } from './librarian-queue.service.js'

// O bibliotecário reenvia o aviso da vez (RF-BAL-06). Só vale para quem está na
// vez (`your_turn`); quem ainda espera, ou já saiu da fila, é recusado. O prazo
// para confirmar não muda. Numa transação: o aluno recebe de novo o aviso "É a sua
// vez", `lastNotifiedAt` e `notifyCount` são atualizados e o auditLog registra
// `queue_resend_notice`. Devolve a fila do livro.
export async function resendTurnNotice(
  librarianUid: string,
  entryId: string,
): Promise<LibrarianQueueResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const bookId = await getDb().runTransaction(async (tx) => {
    const entry = await queueEntriesRepository.findById(entryId, tx)
    if (!entry) throw queueEntryNotFound()
    if (!isActiveEntry(entry)) throw queueEntryNotActive()
    if (
      entry.status !== QUEUE_ENTRY_STATUS.yourTurn ||
      !entry.confirmDeadline
    ) {
      throw resendNotYourTurn()
    }

    queueEntriesRepository.update(tx, entry.id, {
      lastNotifiedAt: at,
      notifyCount: entry.notifyCount + 1,
      updatedAt: at,
    })
    notificationsRepository.create(
      tx,
      entry.studentUid,
      turnNotice({ ...entry, confirmDeadline: entry.confirmDeadline }, at),
    )
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.queueResendNotice,
        targetUid: entry.studentUid,
        bookId: entry.bookId,
        entityId: entry.id,
        details: { notifyCount: entry.notifyCount + 1 },
      },
      at,
    )
    return entry.bookId
  })

  return getLibrarianQueue(bookId)
}
