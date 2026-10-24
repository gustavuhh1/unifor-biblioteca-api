import type { RequestHandler } from 'express'
import { USER_ROLE } from '../shared/types/index.js'
import { authenticate } from './auth.js'
import { requireRole } from './require-role.js'

// Sessão exigida pelas rotas protegidas (RF-AUT-12): sem sessão 401, perfil errado
// 403. Cada módulo usa a do perfil dono da rota, em vez de montar a sua.

// Rotas do aluno.
export const studentSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.student),
]

// Rotas do bibliotecário.
export const librarianSession: RequestHandler[] = [
  authenticate,
  requireRole(USER_ROLE.librarian),
]
