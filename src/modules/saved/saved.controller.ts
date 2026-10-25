import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import { bookParamsSchema } from '../catalog/schemas/request.schemas.js'
import {
  folderBodySchema,
  folderBookParamsSchema,
  folderParamsSchema,
  savedListQuerySchema,
} from './schemas/request.schemas.js'
import * as folderBooks from './services/folder-books.service.js'
import * as folders from './services/folders.service.js'
import * as savedBooks from './services/saved-books.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid de quem está logado (as rotas passam antes pelo authenticate e requireRole).
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// GET /me/saved: Todos os salvos ou os de uma pasta (RF-SAL-01, RF-SAL-03).
export async function listSaved(req: Request, res: Response) {
  const { folderId } = savedListQuerySchema.parse(req.query)
  res.json(await savedBooks.listSaved(uidOf(req), folderId))
}

// PUT /me/saved/:bookId: salva o livro (RF-SAL-01).
export async function saveBook(req: Request, res: Response) {
  const { bookId } = bookParamsSchema.parse(req.params)
  res.json(await savedBooks.saveBook(uidOf(req), bookId))
}

// DELETE /me/saved/:bookId: tira o livro dos salvos (RF-SAL-01).
export async function unsaveBook(req: Request, res: Response) {
  const { bookId } = bookParamsSchema.parse(req.params)
  await savedBooks.unsaveBook(uidOf(req), bookId)
  res.status(204).end()
}

// GET /me/folders: as pastas e a contagem de Todos os salvos (RF-SAL-02).
export async function listFolders(req: Request, res: Response) {
  res.json(await folders.listFolders(uidOf(req)))
}

// POST /me/folders: cria uma pasta (RF-SAL-02).
export async function createFolder(req: Request, res: Response) {
  const { name } = folderBodySchema.parse(req.body)
  res.status(201).json(await folders.createFolder(uidOf(req), name))
}

// PATCH /me/folders/:folderId: renomeia a pasta (RF-SAL-02).
export async function renameFolder(req: Request, res: Response) {
  const { folderId } = folderParamsSchema.parse(req.params)
  const { name } = folderBodySchema.parse(req.body)
  res.json(await folders.renameFolder(uidOf(req), folderId, name))
}

// DELETE /me/folders/:folderId: apaga a pasta, sem apagar os livros (RF-SAL-02).
export async function deleteFolder(req: Request, res: Response) {
  const { folderId } = folderParamsSchema.parse(req.params)
  await folders.deleteFolder(uidOf(req), folderId)
  res.status(204).end()
}

// PUT /me/folders/:folderId/books/:bookId: põe o livro salvo na pasta (RF-SAL-03).
export async function addBookToFolder(req: Request, res: Response) {
  const { folderId, bookId } = folderBookParamsSchema.parse(req.params)
  res.json(await folderBooks.addBookToFolder(uidOf(req), folderId, bookId))
}

// DELETE /me/folders/:folderId/books/:bookId: tira o livro da pasta (RF-SAL-03).
export async function removeBookFromFolder(req: Request, res: Response) {
  const { folderId, bookId } = folderBookParamsSchema.parse(req.params)
  await folderBooks.removeBookFromFolder(uidOf(req), folderId, bookId)
  res.status(204).end()
}
