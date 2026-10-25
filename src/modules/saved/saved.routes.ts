import { Router } from 'express'
import { studentSession } from '../../middlewares/session.js'
import * as controller from './saved.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router do módulo de Salvos. Todas as rotas são do aluno e só mexem nos Salvos
// de quem está logado.
export const savedRouter = Router()

// Todos os salvos (RF-SAL-01).
savedRouter.get('/me/saved', ...studentSession, controller.listSaved)
savedRouter.put('/me/saved/:bookId', ...studentSession, controller.saveBook)
savedRouter.delete(
  '/me/saved/:bookId',
  ...studentSession,
  controller.unsaveBook,
)

// Pastas (RF-SAL-02).
savedRouter.get('/me/folders', ...studentSession, controller.listFolders)
savedRouter.post('/me/folders', ...studentSession, controller.createFolder)
savedRouter.patch(
  '/me/folders/:folderId',
  ...studentSession,
  controller.renameFolder,
)
savedRouter.delete(
  '/me/folders/:folderId',
  ...studentSession,
  controller.deleteFolder,
)

// Livros nas pastas (RF-SAL-03).
savedRouter.put(
  '/me/folders/:folderId/books/:bookId',
  ...studentSession,
  controller.addBookToFolder,
)
savedRouter.delete(
  '/me/folders/:folderId/books/:bookId',
  ...studentSession,
  controller.removeBookFromFolder,
)
