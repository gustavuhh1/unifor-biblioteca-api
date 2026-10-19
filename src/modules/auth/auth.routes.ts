import { Router, type RequestHandler } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/require-role.js'
import * as controller from './auth.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

const session: RequestHandler[] = [authenticate]
const studentSession: RequestHandler[] = [authenticate, requireRole('student')]

export const authRouter = Router()

// Cadastro (RF-AUT-01 a RF-AUT-04).
authRouter.post('/auth/signup/start', controller.signupStart)
authRouter.post('/auth/signup/confirm', controller.signupConfirm)
authRouter.post('/auth/signup/resend', controller.signupResend)

// Recuperação de senha (RF-AUT-08).
authRouter.post('/auth/password/recover', controller.passwordRecover)
authRouter.post('/auth/password/reset', controller.passwordReset)

// Passkey (RF-AUT-04, RF-AUT-05, RF-AUT-10).
authRouter.post('/auth/passkey/register', controller.passkeyRegister)
authRouter.post('/auth/passkey/login/options', controller.passkeyLoginOptions)
authRouter.post('/auth/passkey/login/verify', controller.passkeyLoginVerify)
authRouter.get('/auth/passkeys', ...studentSession, controller.passkeysList)
authRouter.post(
  '/auth/passkeys',
  ...studentSession,
  controller.passkeysCreateOptions,
)
authRouter.delete(
  '/auth/passkeys/:id',
  ...studentSession,
  controller.passkeysRemove,
)

// Sessão (RF-AUT-11).
authRouter.get('/me', ...session, controller.me)
authRouter.patch('/me', ...studentSession, controller.updateMe)
authRouter.post('/auth/logout', ...session, controller.logout)
