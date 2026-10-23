import { isoOrNull } from '../../../shared/iso-date.js'
import {
  ACTIVE_QUEUE_STATUSES,
  type BookRecord,
  type QueueEntryRecord,
} from '../../../shared/types/index.js'
import type {
  EndedQueueEntryResponse,
  LibrarianQueueResponse,
  QueueEntryResponse,
  QueueMovedDownResponse,
  QueuePreviewEditionResponse,
} from '../queues.types.js'
import type { JoinCheck } from './join.rules.js'
import { ALREADY_IN_QUEUE_CODE } from '../queues.constants.js'
import type { MovedDown } from './placement.rules.js'

// Como as telas de fila mostram os lugares (RF-FIL-01, RF-FIL-08, RF-BAL-06). A
// posição e as pessoas na frente são calculadas na hora, a partir da fila ativa
// em ordem; nenhuma é gravada.

// A posição (de 1 em diante) do lugar na fila ativa em ordem, ou 0 se ele não
// estiver nela.
export function positionOf(
  queue: readonly Pick<QueueEntryRecord, 'id'>[],
  entryId: string,
): number {
  return queue.findIndex((entry) => entry.id === entryId) + 1
}

// O status de um lugar da fila ativa. Um lugar fora da fila ativa não deveria
// chegar às respostas de fila; se chegar, é erro de programação.
function activeStatusOf(entry: Pick<QueueEntryRecord, 'id' | 'status'>) {
  const status = ACTIVE_QUEUE_STATUSES.find((value) => value === entry.status)
  if (!status) throw new Error(`O lugar ${entry.id} não está na fila ativa.`)
  return status
}

// Monta um lugar do aluno numa fila ativa (Minhas filas).
export function toQueueEntryResponse(
  entry: QueueEntryRecord,
  position: number,
): QueueEntryResponse {
  return {
    id: entry.id,
    bookId: entry.bookId,
    bookTitle: entry.bookTitle,
    status: activeStatusOf(entry),
    position,
    peopleAhead: position - 1,
    joinedAt: entry.joinedAt.toISOString(),
    confirmDeadline: isoOrNull(entry.confirmDeadline),
    editionGroupId: entry.editionGroupId ?? null,
  }
}

// Monta o lugar que saiu da fila (resposta de sair).
export function toEndedEntryResponse(
  entry: Pick<QueueEntryRecord, 'id' | 'bookId' | 'bookTitle' | 'status'>,
  endedAt: Date,
): EndedQueueEntryResponse {
  return {
    id: entry.id,
    bookId: entry.bookId,
    bookTitle: entry.bookTitle,
    status: entry.status,
    endedAt: endedAt.toISOString(),
  }
}

// Monta uma edição da prévia da fila: as pessoas na frente (os lugares ativos da
// edição), se o aluno já está nela e se pode entrar (RF-FIL-01, RF-FIL-04).
// `alreadyInQueue` vale mesmo quando outro motivo bloqueia a entrada (o livro
// ficou indisponível para novos pedidos com o aluno já na fila, por exemplo).
export function toPreviewEdition(
  book: Pick<
    BookRecord,
    'id' | 'title' | 'edition' | 'year' | 'copiesAvailable'
  >,
  check: JoinCheck,
  peopleAhead: number,
  alreadyInQueue: boolean,
): QueuePreviewEditionResponse {
  return {
    bookId: book.id,
    title: book.title,
    edition: book.edition ?? null,
    year: book.year ?? null,
    copiesAvailable: book.copiesAvailable,
    peopleAhead,
    alreadyInQueue,
    canJoin: check.allowed,
    blockedReason:
      check.allowed || check.reason === ALREADY_IN_QUEUE_CODE
        ? null
        : check.reason,
  }
}

// Monta a fila de um livro para o bibliotecário, na ordem real (RF-BAL-06).
export function toLibrarianQueue(
  book: Pick<
    BookRecord,
    'id' | 'title' | 'edition' | 'year' | 'copiesTotal' | 'copiesAvailable'
  >,
  queue: readonly QueueEntryRecord[],
): LibrarianQueueResponse {
  return {
    book: {
      id: book.id,
      title: book.title,
      edition: book.edition ?? null,
      year: book.year ?? null,
      copiesTotal: book.copiesTotal,
      copiesAvailable: book.copiesAvailable,
    },
    items: queue.map((entry, index) => ({
      id: entry.id,
      position: index + 1,
      status: activeStatusOf(entry),
      studentUid: entry.studentUid,
      studentName: entry.studentName,
      matricula: entry.matricula,
      joinedAt: entry.joinedAt.toISOString(),
      origin: entry.origin,
      addReason: entry.addReason ?? null,
      confirmDeadline: isoOrNull(entry.confirmDeadline),
      lastNotifiedAt: isoOrNull(entry.lastNotifiedAt),
      notifyCount: entry.notifyCount,
      editionGroupId: entry.editionGroupId ?? null,
    })),
  }
}

// Monta a lista de quem desce uma posição, com nome e matrícula (RF-BAL-07).
export function toMovedDownResponse(
  movedDown: readonly MovedDown[],
  queue: readonly Pick<QueueEntryRecord, 'id' | 'studentName' | 'matricula'>[],
): QueueMovedDownResponse[] {
  return movedDown.flatMap((moved) => {
    const entry = queue.find((candidate) => candidate.id === moved.entryId)
    return entry
      ? [
          {
            entryId: moved.entryId,
            studentName: entry.studentName,
            matricula: entry.matricula,
            fromPosition: moved.fromPosition,
            toPosition: moved.toPosition,
          },
        ]
      : []
  })
}

// Os uids dos alunos que descem uma posição, para o auditLog (`details.movedDown`,
// RF-BAL-07).
export function movedDownUids(
  movedDown: readonly MovedDown[],
  queue: readonly Pick<QueueEntryRecord, 'id' | 'studentUid'>[],
): string[] {
  return movedDown.flatMap((moved) => {
    const entry = queue.find((candidate) => candidate.id === moved.entryId)
    return entry ? [entry.studentUid] : []
  })
}
