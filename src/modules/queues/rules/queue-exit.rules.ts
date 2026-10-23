import {
  QUEUE_ENTRY_STATUS,
  type QueueEntry,
} from '../../../shared/types/index.js'
import type { QueueExitStatus } from '../queues.types.js'

// Sair da fila ativa (RF-FIL-05, RF-FIL-07, RF-BAL-06, seção 2.10).

// O lugar está na fila ativa (waiting ou your_turn).
export function isActiveEntry(entry: Pick<QueueEntry, 'status'>): boolean {
  return (
    entry.status === QUEUE_ENTRY_STATUS.waiting ||
    entry.status === QUEUE_ENTRY_STATUS.yourTurn
  )
}

// O que gravar no lugar que sai da fila sem virar pedido: o novo status
// (left, missed, removed ou cancelled_other_edition), quando saiu e, se houver,
// o motivo e quem tirou.
export function exitFields(
  status: QueueExitStatus,
  at: Date,
  by?: { reason?: string; endedBy?: string },
): Partial<QueueEntry> {
  return {
    status,
    endedAt: at,
    ...(by?.reason === undefined ? {} : { endReason: by.reason }),
    ...(by?.endedBy === undefined ? {} : { endedBy: by.endedBy }),
    updatedAt: at,
  }
}

// O que gravar no lugar que vira pedido ao confirmar a vez (RF-FIL-06): sai da
// fila ativa como `fulfilled`, ligado ao pedido criado.
export function fulfilledFields(loanId: string, at: Date): Partial<QueueEntry> {
  return {
    status: QUEUE_ENTRY_STATUS.fulfilled,
    loanId,
    endedAt: at,
    updatedAt: at,
  }
}

// Quantos lugares o aluno libera ao sair de várias filas: 1 por lugar.
export function activeQueueCountAfter(current: number, freed: number): number {
  return Math.max(0, current - freed)
}
