import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/require-role.js'
import { USER_ROLE } from '../../shared/types/index.js'
import * as controller from './queues.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

const studentSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.student),
]
const librarianSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.librarian),
]

// Router do módulo de filas.
export const queuesRouter = Router()

// Aluno: prévia, entrar, minhas filas, sair e confirmar a vez (RF-FIL-01 a RF-FIL-06
// e RF-FIL-08).
queuesRouter.get(
  '/books/:bookId/queue/preview',
  ...studentSession,
  controller.previewBookQueue,
)
queuesRouter.post('/queues', ...studentSession, controller.join)
queuesRouter.get('/me/queues', ...studentSession, controller.listMine)
queuesRouter.post('/queues/:entryId/leave', ...studentSession, controller.leave)
queuesRouter.post(
  '/queues/:entryId/confirm',
  ...studentSession,
  controller.confirm,
)

// Bibliotecário: ver e gerir a fila de um livro (RF-BAL-06, RF-BAL-07).
queuesRouter.get(
  '/librarian/books/:bookId/queue',
  ...librarianSession,
  controller.librarianQueue,
)
queuesRouter.post(
  '/librarian/books/:bookId/queue',
  ...librarianSession,
  controller.add,
)
queuesRouter.patch(
  '/librarian/queues/:entryId/position',
  ...librarianSession,
  controller.move,
)
queuesRouter.post(
  '/librarian/queues/:entryId/resend',
  ...librarianSession,
  controller.resend,
)
queuesRouter.post(
  '/librarian/queues/:entryId/remove',
  ...librarianSession,
  controller.remove,
)
