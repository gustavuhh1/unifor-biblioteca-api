import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  QUEUE_ENTRY_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import { queueEntryNotActive, queueEntryNotFound } from '../queues.errors.js'
import type {
  LibrarianQueueResponse,
  RemoveFromQueueBody,
} from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import {
  activeQueueCountAfter,
  isActiveEntry,
} from '../rules/queue-exit.rules.js'
import { removedByLibrarianNotice } from '../rules/queue-notices.rules.js'
import { getLibrarianQueue } from './librarian-queue.service.js'
import { applyQueueExit, planQueueExit } from './queue-exit.service.js'

// O bibliotecário remove um aluno da fila, com motivo (RF-BAL-06). O motivo é
// obrigatório. Numa transação: o lugar vira `removed` (`endedBy`, `endReason`),
// `queueLength` do livro e `activeQueueCount` do aluno caem 1, o aluno recebe o
// aviso com o motivo e, se era a vez dele, o exemplar guardado passa ao próximo da
// fila ou volta para a estante. O auditLog registra `queue_remove`. Devolve a fila
// do livro já sem o aluno.
export async function removeFromQueue(
  librarianUid: string,
  entryId: string,
  body: RemoveFromQueueBody,
): Promise<LibrarianQueueResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const bookId = await getDb().runTransaction(async (tx) => {
    const entry = await queueEntriesRepository.findById(entryId, tx)
    if (!entry) throw queueEntryNotFound()
    if (!isActiveEntry(entry)) throw queueEntryNotActive()

    const [student, plan] = await Promise.all([
      usersRepository.findById(entry.studentUid, tx),
      planQueueExit(tx, entry),
    ])
    if (!student) throw new Error('Aluno do lugar na fila não encontrado.')

    applyQueueExit(
      tx,
      plan,
      {
        status: QUEUE_ENTRY_STATUS.removed,
        reason: body.reason,
        endedBy: librarianUid,
      },
      at,
      settings,
    )
    usersRepository.setActiveQueueCount(
      tx,
      entry.studentUid,
      activeQueueCountAfter(student.activeQueueCount, 1),
      at,
    )
    notificationsRepository.create(
      tx,
      entry.studentUid,
      removedByLibrarianNotice(entry, body.reason, at),
    )
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.queueRemove,
        targetUid: entry.studentUid,
        bookId: entry.bookId,
        entityId: entry.id,
        reason: body.reason,
        details: { previousStatus: entry.status },
      },
      at,
    )
    return entry.bookId
  })

  invalidateCatalogCache()
  return getLibrarianQueue(bookId)
}
