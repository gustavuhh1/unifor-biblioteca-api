import type { RequestHandler } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env.js'
import { unauthorized } from '../shared/errors.js'

const BEARER_HEADER = /^Bearer\s+(\S+)$/i
const client = new OAuth2Client()

// As rotas internas não aceitam sessão de aluno/bibliotecário. O Cloud Scheduler
// envia um ID token OIDC assinado pelo Google; além da assinatura e audience,
// conferimos a conta de serviço que recebeu permissão para disparar os jobs.
export const authenticateScheduler: RequestHandler = async (
  req,
  _res,
  next,
) => {
  const token = BEARER_HEADER.exec(req.header('authorization') ?? '')?.[1]
  if (!token) throw unauthorized()
  const audience = env.SCHEDULER_AUDIENCE ?? 'https://api.uni-books.app'
  const expectedEmail =
    env.SCHEDULER_SERVICE_ACCOUNT ??
    `unibooks-scheduler@${env.GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com`
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience })
    const payload = ticket.getPayload()
    if (!payload?.email_verified || payload.email !== expectedEmail) {
      throw unauthorized()
    }
    next()
  } catch {
    throw unauthorized()
  }
}
