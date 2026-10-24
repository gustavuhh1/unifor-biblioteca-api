import { Router } from 'express'
import { librarianSession } from '../../middlewares/session.js'
import * as controller from './desk.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router do módulo do balcão (só do bibliotecário).
export const deskRouter = Router()

// Ficha do aluno por QR, código do pedido ou matrícula (RF-BAL-02, RF-BAL-03).
deskRouter.post(
  '/librarian/desk/lookup',
  ...librarianSession,
  controller.lookup,
)

// Registrar a retirada de um pedido (RF-BAL-02).
deskRouter.post(
  '/librarian/loans/:loanId/pickup',
  ...librarianSession,
  controller.pickup,
)
