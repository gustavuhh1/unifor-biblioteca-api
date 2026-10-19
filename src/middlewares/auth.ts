import type { RequestHandler } from 'express'
import { getAdminAuth, getDb } from '../config/firebase.js'
import { AppError, unauthorized } from '../shared/errors.js'
import { userRoleSchema, type UserRole } from '../shared/user-role.js'

export interface AuthenticatedUser {
  uid: string
  role: UserRole
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser
  }
}

const BEARER_HEADER = /^Bearer\s+(\S+)$/i

// Errors the Admin SDK raises about the token itself (expired, revoked,
// malformed, account disabled). Anything else (network, credentials) is not the
// client's fault and must surface as a 500, not as a logout.
function isSessionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  const { code } = error
  return (
    typeof code === 'string' &&
    code.startsWith('auth/') &&
    code !== 'auth/internal-error'
  )
}

// Checks the Firebase ID token (including revocation) and loads the role from
// users/{uid}. No token or an invalid one is a 401; an account whose status is
// not "active" is a 403.
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = BEARER_HEADER.exec(req.header('authorization') ?? '')?.[1]
  if (!token) throw unauthorized()

  let uid: string
  try {
    ;({ uid } = await getAdminAuth().verifyIdToken(token, true))
  } catch (error) {
    throw isSessionError(error) ? unauthorized() : error
  }

  const profile = await getDb().collection('users').doc(uid).get()
  const role = userRoleSchema.safeParse(profile.get('role'))
  if (!role.success) {
    throw new AppError(
      403,
      'profile_not_found',
      'Perfil não encontrado para esta conta.',
    )
  }

  // pending_email (e-mail not confirmed yet) and disabled accounts cannot use the API.
  if (profile.get('status') !== 'active') {
    throw new AppError(403, 'account_disabled', 'Sua conta não está ativa.')
  }

  req.user = { uid, role: role.data }
  next()
}
