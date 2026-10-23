import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/require-role.js'
import { USER_ROLE } from '../../shared/types/index.js'
import * as controller from './loans.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

const studentSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.student),
]

// Router do módulo de empréstimos (só do aluno).
export const loansRouter = Router()

// Pedir, listar, cancelar e renovar (RF-EMP-01 a RF-EMP-05, RF-EMP-08 a RF-EMP-10).
loansRouter.post('/loans', ...studentSession, controller.requestLoan)
loansRouter.get('/me/loans', ...studentSession, controller.listMyLoans)
loansRouter.post(
  '/loans/:loanId/cancel',
  ...studentSession,
  controller.cancelLoan,
)
loansRouter.post(
  '/loans/:loanId/renew',
  ...studentSession,
  controller.renewLoan,
)
