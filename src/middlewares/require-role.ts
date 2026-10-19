import type { RequestHandler } from 'express'
import { forbidden, unauthorized } from '../shared/errors.js'
import type { UserRole } from '../shared/user-role.js'

// Use after `authenticate`: lets the route through only for the given roles.
// Wrong role is a 403.
export function requireRole(
  ...roles: [UserRole, ...UserRole[]]
): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized()
    if (!roles.includes(req.user.role)) throw forbidden()
    next()
  }
}
