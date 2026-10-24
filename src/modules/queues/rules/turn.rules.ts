import {
  QUEUE_ENTRY_STATUS,
  type QueueEntry,
} from '../../../shared/types/index.js'
import { CONFIRM_DENIAL } from '../queues.constants.js'
import type { ConfirmDenial } from '../queues.types.js'

// A vez na fila (RF-FIL-06, RF-FIL-07, seção 2.10). Quando o exemplar volta, o 1º
// da fila tem horas corridas para confirmar (24 por padrão); ao confirmar, nasce o
// pedido com 2 dias úteis para retirar (o prazo do pedido é o mesmo do pedido
// direto: addBusinessDays, de shared/calendar). Quem perde o prazo de confirmar
// sai da fila.

const HOUR_MS = 60 * 60 * 1000

// O prazo para confirmar: `confirmHours` horas corridas depois de a vez começar.
export function confirmDeadlineOf(
  turnStartedAt: Date,
  confirmHours: number,
): Date {
  return new Date(turnStartedAt.getTime() + confirmHours * HOUR_MS)
}

// O que gravar no lugar do 1º da fila quando o exemplar fica guardado para ele
// (RF-FIL-06): é a vez dele, com o prazo para confirmar, o exemplar guardado e o
// primeiro aviso contado.
export function turnStartFields(input: {
  copyId: string
  at: Date
  confirmHours: number
}): Partial<QueueEntry> & { confirmDeadline: Date } {
  const { copyId, at, confirmHours } = input
  return {
    status: QUEUE_ENTRY_STATUS.yourTurn,
    turnStartedAt: at,
    confirmDeadline: confirmDeadlineOf(at, confirmHours),
    reservedCopyId: copyId,
    lastNotifiedAt: at,
    notifyCount: 1,
    updatedAt: at,
  }
}

// A vez venceu (RF-FIL-07): está na vez e o prazo para confirmar já passou. No
// instante exato do prazo ainda dá tempo.
export function isTurnExpired(
  entry: Pick<QueueEntry, 'status' | 'confirmDeadline'>,
  at: Date,
): boolean {
  return (
    entry.status === QUEUE_ENTRY_STATUS.yourTurn &&
    entry.confirmDeadline !== undefined &&
    entry.confirmDeadline.getTime() < at.getTime()
  )
}

// Confere se o aluno pode confirmar a vez agora; devolve o motivo ou null: o
// lugar já saiu da fila, ainda está esperando, ou passou do prazo.
export function confirmDenialOf(
  entry: Pick<QueueEntry, 'status' | 'confirmDeadline'>,
  at: Date,
): ConfirmDenial | null {
  if (entry.status === QUEUE_ENTRY_STATUS.waiting) {
    return CONFIRM_DENIAL.notYourTurn
  }
  if (entry.status !== QUEUE_ENTRY_STATUS.yourTurn) {
    return CONFIRM_DENIAL.queueEntryNotActive
  }
  return isTurnExpired(entry, at) ? CONFIRM_DENIAL.turnExpired : null
}
