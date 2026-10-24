import { Router } from 'express'
import { studentSession, librarianSession } from '../../middlewares/session.js'
import * as controller from './fines.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router do módulo de multas. O aluno só consulta; não há rota de pagamento para
// ele (RF-MUL-03).
export const finesRouter = Router()

// Aluno: Minhas multas (RF-MUL-03, RF-MUL-04).
finesRouter.get('/me/fines', ...studentSession, controller.listMine)

// Bibliotecário: aba Multas e registro do pagamento no balcão (RF-BAL-09).
finesRouter.get('/librarian/fines', ...librarianSession, controller.listAll)
finesRouter.post(
  '/librarian/fines/:fineId/pay',
  ...librarianSession,
  controller.pay,
)
