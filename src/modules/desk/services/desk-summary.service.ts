import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import { FINE_STATUS, QUEUE_ENTRY_STATUS } from '../../../shared/types/index.js'
import * as finesRepository from '../../fines/repositories/fines.repository.js'
import * as queueEntriesRepository from '../../queues/repositories/queue-entries.repository.js'
import type { DeskSummaryResponse } from '../desk.types.js'
import { dayRangeOf } from '../rules/summary.rules.js'

// Os números do dia no Painel do balcão (RF-BAL-01): pedidos aguardando retirada,
// devoluções registradas hoje (fuso de Fortaleza), lugares na fila esperando o
// aluno confirmar e multas em aberto. Só leitura; as quatro contagens rodam juntas.
export async function getDeskSummary(): Promise<DeskSummaryResponse> {
  const at = nowOf(await readLoanSettings())
  const { from, to } = dayRangeOf(at)

  const [pendingPickups, returnsToday, queueAwaitingConfirm, openFines] =
    await Promise.all([
      loansRepository.countAwaitingPickup(),
      loansRepository.countReturnedBetween(from, to),
      queueEntriesRepository.countByStatus(QUEUE_ENTRY_STATUS.yourTurn),
      finesRepository.countByStatus(FINE_STATUS.open),
    ])
  return { pendingPickups, returnsToday, queueAwaitingConfirm, openFines }
}
