import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import {
  addToQueueBodySchema,
  joinQueueBodySchema,
  moveEntryBodySchema,
  queueBookParamsSchema,
  queueEntryParamsSchema,
  removeFromQueueBodySchema,
} from './schemas/request.schemas.js'
import { getLibrarianQueue } from './services/librarian-queue.service.js'
import { listMyQueues } from './services/my-queues.service.js'
import { addToQueue } from './services/queue-add.service.js'
import { confirmTurn } from './services/queue-confirm.service.js'
import { joinQueue } from './services/queue-join.service.js'
import { leaveQueue } from './services/queue-leave.service.js'
import { moveQueueEntry } from './services/queue-move.service.js'
import { previewQueue } from './services/queue-preview.service.js'
import { removeFromQueue } from './services/queue-remove.service.js'
import { resendTurnNotice } from './services/queue-resend.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid de quem está logado (as rotas passam antes pelo authenticate e requireRole).
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// GET /books/:bookId/queue/preview: pessoas na frente antes de entrar (RF-FIL-01).
export async function previewBookQueue(req: Request, res: Response) {
  const { bookId } = queueBookParamsSchema.parse(req.params)
  res.json(await previewQueue(uidOf(req), bookId))
}

// POST /queues: entra na fila de uma ou mais edições (RF-FIL-02 a RF-FIL-04).
export async function join(req: Request, res: Response) {
  const body = joinQueueBodySchema.parse(req.body)
  res.status(201).json(await joinQueue(uidOf(req), body))
}

// GET /me/queues: Minhas filas (RF-FIL-08).
export async function listMine(req: Request, res: Response) {
  res.json(await listMyQueues(uidOf(req)))
}

// POST /queues/:entryId/leave: sai da fila (RF-FIL-05).
export async function leave(req: Request, res: Response) {
  const { entryId } = queueEntryParamsSchema.parse(req.params)
  res.json(await leaveQueue(uidOf(req), entryId))
}

// POST /queues/:entryId/confirm: confirma a vez (RF-FIL-06).
export async function confirm(req: Request, res: Response) {
  const { entryId } = queueEntryParamsSchema.parse(req.params)
  res.json(await confirmTurn(uidOf(req), entryId))
}

// GET /librarian/books/:bookId/queue: a fila de um livro (RF-BAL-06).
export async function librarianQueue(req: Request, res: Response) {
  const { bookId } = queueBookParamsSchema.parse(req.params)
  res.json(await getLibrarianQueue(bookId))
}

// POST /librarian/books/:bookId/queue: adiciona um aluno (RF-BAL-06, RF-BAL-07).
// 201 quando o aluno entrou; 200 quando falta confirmar a passagem à frente.
export async function add(req: Request, res: Response) {
  const { bookId } = queueBookParamsSchema.parse(req.params)
  const body = addToQueueBodySchema.parse(req.body)
  const change = await addToQueue(uidOf(req), bookId, body)
  res.status(change.applied ? 201 : 200).json(change)
}

// PATCH /librarian/queues/:entryId/position: muda a posição (RF-BAL-06, RF-BAL-07).
export async function move(req: Request, res: Response) {
  const { entryId } = queueEntryParamsSchema.parse(req.params)
  const body = moveEntryBodySchema.parse(req.body)
  res.json(await moveQueueEntry(uidOf(req), entryId, body))
}

// POST /librarian/queues/:entryId/resend: reenvia o aviso da vez (RF-BAL-06).
export async function resend(req: Request, res: Response) {
  const { entryId } = queueEntryParamsSchema.parse(req.params)
  res.json(await resendTurnNotice(uidOf(req), entryId))
}

// POST /librarian/queues/:entryId/remove: remove da fila, com motivo (RF-BAL-06).
export async function remove(req: Request, res: Response) {
  const { entryId } = queueEntryParamsSchema.parse(req.params)
  const body = removeFromQueueBodySchema.parse(req.body)
  res.json(await removeFromQueue(uidOf(req), entryId, body))
}
