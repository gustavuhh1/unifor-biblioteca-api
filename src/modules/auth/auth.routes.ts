import { Router, type Request, type RequestHandler } from 'express'
import { authenticate } from '../../middlewares/auth.js'
import { requireRole } from '../../middlewares/require-role.js'
import { unauthorized } from '../../shared/errors.js'
import {
  matriculaBodySchema,
  passkeyLoginVerifyBodySchema,
  passkeyParamsSchema,
  passkeyRegisterBodySchema,
  passwordResetBodySchema,
  signupConfirmBodySchema,
  signupStartBodySchema,
  updateMeBodySchema,
} from './auth.schemas.js'
import {
  createLoginOptions,
  createRegistrationOptions,
  listPasskeys,
  removePasskey,
  verifyLogin,
  verifyRegistration,
} from './passkey.service.js'
import { requestPasswordRecovery, resetPassword } from './password.service.js'
import { getMe, logout, updateFullName } from './session.service.js'
import {
  confirmSignup,
  resendSignupToken,
  startSignup,
} from './signup.service.js'

// `authenticate` always sets `req.user` before these handlers run.
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

const session: RequestHandler[] = [authenticate]
const studentSession: RequestHandler[] = [authenticate, requireRole('student')]

export const authRouter = Router()

// --- Sign-up (RF-AUT-01 to RF-AUT-04) ---------------------------------------

authRouter.post('/auth/signup/start', async (req, res) => {
  const body = signupStartBodySchema.parse(req.body)
  res.status(202).json(await startSignup(body))
})

authRouter.post('/auth/signup/confirm', async (req, res) => {
  const body = signupConfirmBodySchema.parse(req.body)
  res.json(await confirmSignup(body))
})

authRouter.post('/auth/signup/resend', async (req, res) => {
  const { matricula } = matriculaBodySchema.parse(req.body)
  res.status(202).json(await resendSignupToken(matricula))
})

// --- Password recovery (RF-AUT-08) -------------------------------------------

authRouter.post('/auth/password/recover', async (req, res) => {
  const { matricula } = matriculaBodySchema.parse(req.body)
  res.json(await requestPasswordRecovery(matricula))
})

authRouter.post('/auth/password/reset', async (req, res) => {
  await resetPassword(passwordResetBodySchema.parse(req.body))
  res.status(204).end()
})

// --- Passkey (RF-AUT-04, RF-AUT-05, RF-AUT-10) --------------------------------

authRouter.post('/auth/passkey/register', async (req, res) => {
  const body = passkeyRegisterBodySchema.parse(req.body)
  res.status(201).json(await verifyRegistration(body))
})

authRouter.post('/auth/passkey/login/options', async (req, res) => {
  const { matricula } = matriculaBodySchema.parse(req.body)
  res.json(await createLoginOptions(matricula))
})

authRouter.post('/auth/passkey/login/verify', async (req, res) => {
  const body = passkeyLoginVerifyBodySchema.parse(req.body)
  res.json(await verifyLogin(body))
})

authRouter.get('/auth/passkeys', ...studentSession, async (req, res) => {
  res.json(await listPasskeys(uidOf(req)))
})

authRouter.post('/auth/passkeys', ...studentSession, async (req, res) => {
  res.json(await createRegistrationOptions(uidOf(req)))
})

authRouter.delete('/auth/passkeys/:id', ...studentSession, async (req, res) => {
  const { id } = passkeyParamsSchema.parse(req.params)
  await removePasskey(uidOf(req), id)
  res.status(204).end()
})

// --- Session (RF-AUT-11) ----------------------------------------------------

authRouter.get('/me', ...session, async (req, res) => {
  res.json(await getMe(uidOf(req)))
})

authRouter.patch('/me', ...studentSession, async (req, res) => {
  const { fullName } = updateMeBodySchema.parse(req.body)
  res.json(await updateFullName(uidOf(req), fullName))
})

authRouter.post('/auth/logout', ...session, async (req, res) => {
  await logout(uidOf(req))
  res.status(204).end()
})
