import type { RequestHandler } from 'express'
import { forbidden, unauthorized } from '../shared/errors.js'
import type { UserRole } from '../shared/types/index.js'

// Libera a rota só para os perfis informados (RF-AUT-12). Use depois do
// `authenticate`. Perfil errado recebe 403.
export function requireRole(
  ...roles: [UserRole, ...UserRole[]]
): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized()
    if (!roles.includes(req.user.role)) throw forbidden()
    next()
  }
}
