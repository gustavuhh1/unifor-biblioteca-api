import {
  QUEUE_ENTRY_STATUS,
  type QueueEntryStatus,
} from '../../../shared/types/index.js'
import { PLACEMENT_REFUSAL, QUEUE_ORDER_STEP } from '../queues.constants.js'
import type { PlacementRefusal } from '../queues.types.js'

// Posição na fila de uma edição (RF-BAL-06, RF-BAL-07, seção 2.10). A ordem é o
// campo `order` (menor = na frente). O bibliotecário põe alguém entre dois alunos
// com um valor intermediário; quem está na vez (`your_turn`) fica sempre na
// frente e não se move.

// Um lugar da fila ativa, na ordem real.
export interface QueueSlot {
  id: string
  order: number
  status: QueueEntryStatus
}

// Um aluno que desce uma posição porque alguém passou à frente dele.
export interface MovedDown {
  entryId: string
  fromPosition: number
  toPosition: number
}

// Onde o lugar fica, com o que gravar.
export interface Placement {
  // Posição final, de 1 (a frente) em diante.
  position: number
  // O `order` do lugar movido ou novo.
  order: number
  // Outros lugares que ganham novo `order`. Vazio, a não ser que não haja valor
  // intermediário livre entre os vizinhos: aí a fila toda é renumerada.
  renumbered: { entryId: string; order: number }[]
  // Quem desce uma posição. Se não estiver vazio, a mudança passa à frente de
  // alguém e pede confirmação (RF-BAL-07).
  movedDown: MovedDown[]
}

export type PlacementResult =
  { ok: true; placement: Placement } | { ok: false; refusal: PlacementRefusal }

const refused = (refusal: PlacementRefusal): PlacementResult => ({
  ok: false,
  refusal,
})

// Um `order` estritamente entre os dois vizinhos, ou undefined se não houver
// (valores colados). Sem vizinho de trás é o fim da fila (+ passo); sem vizinho
// da frente, a metade do primeiro.
function orderBetween(
  previous: number | undefined,
  next: number | undefined,
): number | undefined {
  if (previous === undefined && next === undefined) return QUEUE_ORDER_STEP
  if (next === undefined) return previous! + QUEUE_ORDER_STEP
  const order = previous === undefined ? next / 2 : (previous + next) / 2
  const floor = previous ?? 0
  return order > floor && order < next ? order : undefined
}

// Decide onde o lugar fica ao pôr alguém na `position` da fila (1 = frente).
// `queue` é a fila ativa em ordem; `entryId` é quem se move (sem ele, é uma
// entrada nova). Recusa: quem está na vez (turn_in_progress), a posição que não
// existe ou fica antes de quem está na vez (invalid_position) e ficar onde já
// está (same_position). Passar à frente de outros devolve a lista de quem desce.
export function planPlacement(input: {
  queue: readonly QueueSlot[]
  entryId?: string
  position: number
}): PlacementResult {
  const { queue, entryId, position } = input
  const currentIndex = entryId ? queue.findIndex((s) => s.id === entryId) : -1
  const moving = currentIndex >= 0 ? queue[currentIndex] : undefined
  if (moving?.status === QUEUE_ENTRY_STATUS.yourTurn) {
    return refused(PLACEMENT_REFUSAL.turnInProgress)
  }

  const others = queue.filter((slot) => slot.id !== entryId)
  const inTurn = others.filter(
    (slot) => slot.status === QUEUE_ENTRY_STATUS.yourTurn,
  ).length
  if (position < inTurn + 1 || position > others.length + 1) {
    return refused(PLACEMENT_REFUSAL.invalidPosition)
  }
  if (moving && position === currentIndex + 1) {
    return refused(PLACEMENT_REFUSAL.samePosition)
  }

  const index = position - 1
  const finalIds = [
    ...others.slice(0, index).map((slot) => slot.id),
    entryId ?? '',
    ...others.slice(index).map((slot) => slot.id),
  ]
  const movedDown = others.flatMap((slot): MovedDown[] => {
    const fromPosition = queue.findIndex((s) => s.id === slot.id) + 1
    const toPosition = finalIds.indexOf(slot.id) + 1
    return toPosition > fromPosition
      ? [{ entryId: slot.id, fromPosition, toPosition }]
      : []
  })

  const order = orderBetween(others[index - 1]?.order, others[index]?.order)
  if (order !== undefined) {
    return {
      ok: true,
      placement: { position, order, renumbered: [], movedDown },
    }
  }
  // Sem valor livre entre os vizinhos: renumera a fila toda de 1000 em 1000.
  const renumbered = finalIds.flatMap((id, i) => {
    const newOrder = (i + 1) * QUEUE_ORDER_STEP
    const slot = others.find((s) => s.id === id)
    return slot && slot.order !== newOrder
      ? [{ entryId: id, order: newOrder }]
      : []
  })
  return {
    ok: true,
    placement: {
      position,
      order: position * QUEUE_ORDER_STEP,
      renumbered,
      movedDown,
    },
  }
}

// Passar à frente de alguém (RF-BAL-07): pede confirmação, listando quem desce, e
// motivo obrigatório. No fim da fila, ou para trás, nada disso.
export function passesAhead(placement: Pick<Placement, 'movedDown'>): boolean {
  return placement.movedDown.length > 0
}

// O que fazer com a mudança pedida (RF-BAL-07): aplicar já (`apply`), pedir a
// confirmação mostrando quem desce (`confirm`) ou recusar por falta do motivo
// (`reason_required`).
export const PLACEMENT_DECISION = {
  apply: 'apply',
  confirm: 'confirm',
  reasonRequired: 'reason_required',
} as const

export type PlacementDecision =
  (typeof PLACEMENT_DECISION)[keyof typeof PLACEMENT_DECISION]

// Decide o que fazer com a mudança, a partir do que o bibliotecário enviou. Sem
// passar à frente de ninguém (no fim da fila, ou para trás), aplica sem perguntar
// e sem exigir motivo. Passando à frente: primeiro pede a confirmação; confirmada,
// exige o motivo.
export function decidePlacement(
  placement: Pick<Placement, 'movedDown'>,
  input: { confirmed: boolean; reason?: string | undefined },
): PlacementDecision {
  if (!passesAhead(placement)) return PLACEMENT_DECISION.apply
  if (!input.confirmed) return PLACEMENT_DECISION.confirm
  return input.reason
    ? PLACEMENT_DECISION.apply
    : PLACEMENT_DECISION.reasonRequired
}

// O `order` de quem entra no fim da fila: o maior atual + o passo (seção 2.10),
// ou o primeiro passo numa fila vazia.
export function nextOrderAtEnd(queue: readonly Pick<QueueSlot, 'order'>[]) {
  return (
    queue.reduce((max, slot) => Math.max(max, slot.order), 0) + QUEUE_ORDER_STEP
  )
}
