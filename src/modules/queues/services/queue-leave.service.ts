import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { QUEUE_ENTRY_STATUS } from '../../../shared/types/index.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import { queueEntryNotActive, queueEntryNotFound } from '../queues.errors.js'
import type { EndedQueueEntryResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import {
  activeQueueCountAfter,
  isActiveEntry,
} from '../rules/queue-exit.rules.js'
import { toEndedEntryResponse } from '../rules/queue-view.rules.js'
import { applyQueueExit, planQueueExit } from './queue-exit.service.js'

// O aluno sai da fila (RF-FIL-05). Só o dono do lugar (outro aluno recebe 404) e só
// enquanto o lugar está na fila ativa (senão 409). Recusar a vez também é sair.
// Numa transação: o lugar vira `left`, `queueLength` do livro e `activeQueueCount`
// do aluno caem 1 (a vaga das 7 filas volta) e, se era a vez do aluno, o exemplar
// guardado passa ao próximo da fila ou volta para a estante.
export async function leaveQueue(
  uid: string,
  entryId: string,
): Promise<EndedQueueEntryResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const left = await getDb().runTransaction(async (tx) => {
    const entry = await queueEntriesRepository.findById(entryId, tx)
    if (!entry || entry.studentUid !== uid) throw queueEntryNotFound()
    if (!isActiveEntry(entry)) throw queueEntryNotActive()

    const [student, plan] = await Promise.all([
      usersRepository.findById(uid, tx),
      planQueueExit(tx, entry),
    ])
    if (!student) throw new Error('Aluno do lugar na fila não encontrado.')

    applyQueueExit(tx, plan, { status: QUEUE_ENTRY_STATUS.left }, at, settings)
    usersRepository.setActiveQueueCount(
      tx,
      uid,
      activeQueueCountAfter(student.activeQueueCount, 1),
      at,
    )
    return { ...entry, status: QUEUE_ENTRY_STATUS.left }
  })

  invalidateCatalogCache()
  return toEndedEntryResponse(left, at)
}
