import { readLoanSettings } from '../../../shared/firestore/settings.js'
import type { MyQueuesResponse } from '../queues.types.js'
import * as queueEntriesRepository from '../repositories/queue-entries.repository.js'
import { positionOf, toQueueEntryResponse } from '../rules/queue-view.rules.js'

// Minhas filas (RF-FIL-08): os lugares ativos do aluno (waiting e your_turn), dos
// mais antigos para os mais novos, cada um com a posição calculada na hora pela
// ordem real da fila da edição e, na vez, o prazo para confirmar. Um lugar que não
// aparece na fila da própria edição (mudou no meio da leitura) fica de fora.
export async function listMyQueues(uid: string): Promise<MyQueuesResponse> {
  const [settings, entries] = await Promise.all([
    readLoanSettings(),
    queueEntriesRepository.listActiveByStudent(uid),
  ])
  const queues = await Promise.all(
    entries.map((entry) =>
      queueEntriesRepository.listActiveByBook(entry.bookId),
    ),
  )

  const items = entries.flatMap((entry, index) => {
    const position = positionOf(queues[index] ?? [], entry.id)
    return position > 0 ? [toQueueEntryResponse(entry, position)] : []
  })
  return {
    items,
    activeQueueCount: items.length,
    maxActiveQueues: settings.maxActiveQueues,
  }
}
