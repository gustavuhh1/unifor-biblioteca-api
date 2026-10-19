import type { Request, Response } from 'express'
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
} from './schemas/request.schemas.js'
import * as passkeyService from './services/passkey.service.js'
import * as passwordService from './services/password.service.js'
import * as sessionService from './services/session.service.js'
import * as signupService from './services/signup.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// Uid de quem está logado; o authenticate sempre o coloca em req.user antes.
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// --- Cadastro (RF-AUT-01 a RF-AUT-04) ----------------------------------------

// POST /auth/signup/start: inicia o cadastro do aluno (RF-AUT-01, RF-AUT-02).
export async function signupStart(req: Request, res: Response) {
  const body = signupStartBodySchema.parse(req.body)
  res.status(202).json(await signupService.startSignup(body))
}

// POST /auth/signup/confirm: confirma o e-mail com o token (RF-AUT-03, RF-AUT-04).
export async function signupConfirm(req: Request, res: Response) {
  const body = signupConfirmBodySchema.parse(req.body)
  res.json(await signupService.confirmSignup(body))
}

// POST /auth/signup/resend: reenvia o token de confirmação (RF-AUT-03).
export async function signupResend(req: Request, res: Response) {
  const { matricula } = matriculaBodySchema.parse(req.body)
  res.status(202).json(await signupService.resendSignupToken(matricula))
}

// --- Recuperação de senha (RF-AUT-08) ----------------------------------------

// POST /auth/password/recover: pede o token de recuperação de senha (RF-AUT-08).
export async function passwordRecover(req: Request, res: Response) {
  const { matricula } = matriculaBodySchema.parse(req.body)
  res.json(await passwordService.requestPasswordRecovery(matricula))
}

// POST /auth/password/reset: define a nova senha com o token (RF-AUT-08).
export async function passwordReset(req: Request, res: Response) {
  await passwordService.resetPassword(passwordResetBodySchema.parse(req.body))
  res.status(204).end()
}

// --- Passkey (RF-AUT-04, RF-AUT-05, RF-AUT-10) --------------------------------

// POST /auth/passkey/register: registra o passkey criado pelo celular (RF-AUT-04).
export async function passkeyRegister(req: Request, res: Response) {
  const body = passkeyRegisterBodySchema.parse(req.body)
  res.status(201).json(await passkeyService.verifyRegistration(body))
}

// POST /auth/passkey/login/options: devolve o desafio do login com passkey (RF-AUT-05).
export async function passkeyLoginOptions(req: Request, res: Response) {
  const { matricula } = matriculaBodySchema.parse(req.body)
  res.json(await passkeyService.createLoginOptions(matricula))
}

// POST /auth/passkey/login/verify: confere o passkey e devolve o custom token (RF-AUT-05).
export async function passkeyLoginVerify(req: Request, res: Response) {
  const body = passkeyLoginVerifyBodySchema.parse(req.body)
  res.json(await passkeyService.verifyLogin(body))
}

// GET /auth/passkeys: lista os passkeys do aluno (RF-AUT-10).
export async function passkeysList(req: Request, res: Response) {
  res.json(await passkeyService.listPasskeys(uidOf(req)))
}

// POST /auth/passkeys: pede as opções para criar um passkey neste aparelho (RF-AUT-10).
export async function passkeysCreateOptions(req: Request, res: Response) {
  res.json(await passkeyService.createRegistrationOptions(uidOf(req)))
}

// DELETE /auth/passkeys/:id: remove um passkey do aluno (RF-AUT-10).
export async function passkeysRemove(req: Request, res: Response) {
  const { id } = passkeyParamsSchema.parse(req.params)
  await passkeyService.removePasskey(uidOf(req), id)
  res.status(204).end()
}

// --- Sessão (RF-AUT-11) -------------------------------------------------------

// GET /me: dados de quem está logado.
export async function me(req: Request, res: Response) {
  res.json(await sessionService.getMe(uidOf(req)))
}

// PATCH /me: o aluno informa o nome completo.
export async function updateMe(req: Request, res: Response) {
  const { fullName } = updateMeBodySchema.parse(req.body)
  res.json(await sessionService.updateFullName(uidOf(req), fullName))
}

// POST /auth/logout: encerra a sessão (RF-AUT-11).
export async function logout(req: Request, res: Response) {
  await sessionService.logout(uidOf(req))
  res.status(204).end()
}
