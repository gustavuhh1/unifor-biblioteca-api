import type { z } from 'zod'
import type {
  CONFIRM_DENIALS,
  PLACEMENT_REFUSALS,
  QUEUE_EXIT_STATUSES,
} from './queues.constants.js'
import type {
  addToQueueBodySchema,
  joinQueueBodySchema,
  moveEntryBodySchema,
  removeFromQueueBodySchema,
} from './schemas/request.schemas.js'
import type {
  confirmTurnResponseSchema,
  endedQueueEntrySchema,
  joinQueueResponseSchema,
  librarianQueueSchema,
  myQueuesResponseSchema,
  queueChangeResponseSchema,
  queueEntrySchema,
  queueMovedDownSchema,
  queuePreviewEditionSchema,
  queuePreviewSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo de filas. Os documentos das coleções e os enums
// ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

// Corpo de POST /queues.
export type JoinQueueBody = z.infer<typeof joinQueueBodySchema>
// Corpo de POST /librarian/books/:bookId/queue.
export type AddToQueueBody = z.infer<typeof addToQueueBodySchema>
// Corpo de PATCH /librarian/queues/:entryId/position.
export type MoveEntryBody = z.infer<typeof moveEntryBodySchema>
// Corpo de POST /librarian/queues/:entryId/remove.
export type RemoveFromQueueBody = z.infer<typeof removeFromQueueBodySchema>

// Um lugar na fila, como o aluno o vê.
export type QueueEntryResponse = z.infer<typeof queueEntrySchema>
// Uma edição da prévia da fila.
export type QueuePreviewEditionResponse = z.infer<
  typeof queuePreviewEditionSchema
>
// Quem desce uma posição quando alguém passa à frente.
export type QueueMovedDownResponse = z.infer<typeof queueMovedDownSchema>
// Resposta de GET /books/:bookId/queue/preview.
export type QueuePreviewResponse = z.infer<typeof queuePreviewSchema>
// Resposta de POST /queues.
export type JoinQueueResponse = z.infer<typeof joinQueueResponseSchema>
// Resposta de GET /me/queues.
export type MyQueuesResponse = z.infer<typeof myQueuesResponseSchema>
// Resposta de POST /queues/:entryId/leave.
export type EndedQueueEntryResponse = z.infer<typeof endedQueueEntrySchema>
// Resposta de POST /queues/:entryId/confirm.
export type ConfirmTurnResponse = z.infer<typeof confirmTurnResponseSchema>
// A fila de um livro, como o bibliotecário a vê.
export type LibrarianQueueResponse = z.infer<typeof librarianQueueSchema>
// Resposta de adicionar e mover (com ou sem a mudança feita).
export type QueueChangeResponse = z.infer<typeof queueChangeResponseSchema>

// --- Constantes do módulo ----------------------------------------------------

// Status com que um lugar sai da fila ativa sem virar pedido.
export type QueueExitStatus = (typeof QUEUE_EXIT_STATUSES)[number]
// Motivo de a posição pedida na fila ser recusada.
export type PlacementRefusal = (typeof PLACEMENT_REFUSALS)[number]
// Motivo de o aluno não poder confirmar a vez.
export type ConfirmDenial = (typeof CONFIRM_DENIALS)[number]
