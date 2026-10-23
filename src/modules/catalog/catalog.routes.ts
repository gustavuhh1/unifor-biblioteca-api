import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/require-role.js'
import { USER_ROLE } from '../../shared/types/index.js'
import * as controller from './catalog.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

const session: RequestHandler[] = [authenticate]
const librarianSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.librarian),
]

// Router do módulo do acervo.
export const catalogRouter = Router()

// Busca e página do livro (RF-ACE-01, RF-ACE-02, RF-ACE-03, RF-ACE-08).
catalogRouter.get('/books', ...session, controller.listBooks)
catalogRouter.get('/books/:bookId', ...session, controller.getBook)

// Gestão do acervo, só do bibliotecário (RF-GAC-01 a RF-GAC-06).
catalogRouter.get(
  '/librarian/books',
  ...librarianSession,
  controller.listLibrarianBooks,
)
catalogRouter.get(
  '/librarian/books/isbn/:isbn',
  ...librarianSession,
  controller.lookupBookByIsbn,
)
catalogRouter.post(
  '/librarian/books',
  ...librarianSession,
  controller.createBook,
)
catalogRouter.patch(
  '/librarian/books/:bookId',
  ...librarianSession,
  controller.updateBook,
)
catalogRouter.post(
  '/librarian/books/:bookId/sync',
  ...librarianSession,
  controller.syncBook,
)
catalogRouter.delete(
  '/librarian/books/:bookId',
  ...librarianSession,
  controller.removeBook,
)
