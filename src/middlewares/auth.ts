import type { RequestHandler } from 'express'
import { getAdminAuth, getDb } from '../config/firebase.js'
import { AppError, unauthorized } from '../shared/errors.js'
import { userRoleSchema } from '../shared/user-role.js'
import { USER_STATUS, type UserRole } from '../shared/types/index.js'

// Quem está logado: o uid do Firebase e o perfil lido em users/{uid}.
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

// Erros que o Admin SDK levanta sobre o próprio token (vencido, revogado,
// malformado, conta desativada). Qualquer outro (rede, credenciais) não é culpa
// do cliente e deve aparecer como 500, não como logout.
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

// Exige sessão (RF-AUT-12): confere o ID token do Firebase, inclusive a
// revogação, e lê o perfil em users/{uid}. Sem token ou com token inválido a
// resposta é 401; conta cujo status não é "active" recebe 403.
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

  // Conta pending_email (e-mail ainda não confirmado) ou desativada não usa a API.
  if (profile.get('status') !== USER_STATUS.active) {
    throw new AppError(403, 'account_disabled', 'Sua conta não está ativa.')
  }

  req.user = { uid, role: role.data }
  next()
}
