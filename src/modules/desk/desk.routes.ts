import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/require-role.js'
import { USER_ROLE } from '../../shared/types/index.js'
import * as controller from './desk.controller.js'

const librarianSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.librarian),
]

export const deskRouter = Router()

deskRouter.get(
  '/librarian/dashboard',
  ...librarianSession,
  controller.dashboard,
)
deskRouter.get('/librarian/pickups', ...librarianSession, controller.pickups)
deskRouter.get(
  '/librarian/students/lookup',
  ...librarianSession,
  controller.student,
)
deskRouter.post(
  '/librarian/loans/:loanId/pickup',
  ...librarianSession,
  controller.pickup,
)
deskRouter.post(
  '/librarian/loans/:loanId/return',
  ...librarianSession,
  controller.returnLoan,
)
