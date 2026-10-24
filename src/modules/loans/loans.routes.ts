import { Router } from 'express'
import { studentSession } from '../../middlewares/session.js'
import * as controller from './loans.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

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
