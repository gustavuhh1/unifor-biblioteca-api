import { getDb } from '../../../config/firebase.js'
import { invalidateCatalogCache } from '../../../shared/catalog-cache.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { QUEUE_ENTRY_STATUS } from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as notificationsRepository from '../../notifications/repositories/notifications.repository.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { activeQueueCountAfter } from '../rules/queue-exit.rules.js'
import { turnMissedNotice } from '../rules/queue-notices.rules.js'
import { isTurnExpired } from '../rules/turn.rules.js'
import { applyQueueExit, planQueueExit } from './queue-exit.service.js'

// O que a rotina fez: quantas vezes venceram e quais lugares saíram da fila.
export interface ExpiredTurnsResult {
  processed: number
  entryIds: string[]
}

// Tira da fila quem perdeu o prazo de confirmar a vez (RF-FIL-07, rotina
// `advance_queues`). QUEM CHAMA: a rota do Cloud Scheduler do módulo `jobs`
// (RF-SIS-05, dia 26), passando o "agora" das regras de negócio (shared/clock);
// ainda não há rota. Cada vez vencida (`your_turn` com `confirmDeadline` antes de
// `at`) é tratada numa transação própria, uma de cada vez: o lugar vira `missed`,
// `queueLength` do livro e `activeQueueCount` do aluno caem 1 (a vaga das 7 filas
// volta), o aluno recebe o aviso de vez perdida e o exemplar guardado passa ao
// próximo da fila (que ganha a vez e o aviso) ou volta para a estante. Dentro da
// transação o lugar é conferido de novo, então rodar a rotina duas vezes seguidas,
// ou ao mesmo tempo que o aluno confirma, não repete nem desfaz nada.
export async function expireQueueTurns(at: Date): Promise<ExpiredTurnsResult> {
  const settings = await readLoanSettings()
  const entryIds: string[] = []

  for (const id of await queueEntriesRepository.listTurnIdsExpiredBefore(at)) {
    const expired = await getDb().runTransaction(async (tx) => {
      const entry = await queueEntriesRepository.findById(id, tx)
      if (!entry || !isTurnExpired(entry, at)) return false

      const [student, plan] = await Promise.all([
        usersRepository.findById(entry.studentUid, tx),
        planQueueExit(tx, entry),
      ])
      if (!student) throw new Error('Aluno do lugar na fila não encontrado.')

      applyQueueExit(
        tx,
        plan,
        { status: QUEUE_ENTRY_STATUS.missed },
        at,
        settings,
      )
      notificationsRepository.create(
        tx,
        entry.studentUid,
        turnMissedNotice(entry, at),
      )
      usersRepository.setActiveQueueCount(
        tx,
        entry.studentUid,
        activeQueueCountAfter(student.activeQueueCount, 1),
        at,
      )
      return true
    })
    if (expired) entryIds.push(id)
  }

  if (entryIds.length > 0) invalidateCatalogCache()
  return { processed: entryIds.length, entryIds }
}
