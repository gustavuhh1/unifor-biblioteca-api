import type { Request, Response } from 'express'
import type { AuthenticatedUser } from '../../middlewares/auth.js'
import { unauthorized } from '../../shared/errors.js'
import type { Actor } from './catalog.types.js'
import {
  bookParamsSchema,
  createBookBodySchema,
  isbnParamsSchema,
  librarianListBooksQuerySchema,
  listBooksQuerySchema,
  updateBookBodySchema,
} from './schemas/request.schemas.js'
import * as bookManagementService from './services/book-management.service.js'
import * as bookPageService from './services/book-page.service.js'
import * as catalogSearchService from './services/catalog-search.service.js'
import * as googleBooksService from './services/google-books.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// Quem está logado; o authenticate sempre o coloca em req.user antes.
function userOf(req: Request): AuthenticatedUser {
  if (!req.user) throw unauthorized()
  return req.user
}

// Quem faz a ação de gestão, para o auditLog.
function actorOf(req: Request): Actor {
  const { uid, role } = userOf(req)
  return { uid, role }
}

// --- Busca e página do livro --------------------------------------------------

// GET /books: busca no acervo (RF-ACE-01).
export async function listBooks(req: Request, res: Response) {
  const query = listBooksQuerySchema.parse(req.query)
  res.json(await catalogSearchService.searchCatalog(query))
}

// GET /books/:bookId: página do livro (RF-ACE-02, RF-ACE-03, RF-ACE-08).
export async function getBook(req: Request, res: Response) {
  const { bookId } = bookParamsSchema.parse(req.params)
  res.json(await bookPageService.getBookPage(bookId, userOf(req)))
}

// --- Gestão do acervo ---------------------------------------------------------

// GET /librarian/books: lista e busca do bibliotecário (RF-GAC-01).
export async function listLibrarianBooks(req: Request, res: Response) {
  const query = librarianListBooksQuerySchema.parse(req.query)
  res.json(await catalogSearchService.searchLibrarianCatalog(query))
}

// GET /librarian/google-books/:isbn: consulta o ISBN no Google Books (RF-GAC-02).
export async function lookupGoogleBook(req: Request, res: Response) {
  const { isbn } = isbnParamsSchema.parse(req.params)
  res.json(await googleBooksService.lookupGoogleBook(isbn))
}

// POST /librarian/books: cadastra um livro e os exemplares (RF-GAC-02).
export async function createBook(req: Request, res: Response) {
  const body = createBookBodySchema.parse(req.body)
  res
    .status(201)
    .json(await bookManagementService.createBook(body, actorOf(req)))
}

// PATCH /librarian/books/:bookId: edita um livro (RF-GAC-03, RF-GAC-06).
export async function updateBook(req: Request, res: Response) {
  const { bookId } = bookParamsSchema.parse(req.params)
  const body = updateBookBodySchema.parse(req.body)
  res.json(await bookManagementService.updateBook(bookId, body, actorOf(req)))
}

// POST /librarian/books/:bookId/sync-google: atualiza pelo Google Books (RF-GAC-04).
export async function syncGoogle(req: Request, res: Response) {
  const { bookId } = bookParamsSchema.parse(req.params)
  res.json(await googleBooksService.syncBookFromGoogle(bookId, actorOf(req)))
}

// DELETE /librarian/books/:bookId: remove um livro do acervo (RF-GAC-05).
export async function removeBook(req: Request, res: Response) {
  const { bookId } = bookParamsSchema.parse(req.params)
  await bookManagementService.removeBook(bookId, actorOf(req))
  res.status(204).end()
}
