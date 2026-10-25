import type { RequestHandler } from 'express'
import { env } from '../config/env.js'
import {
  googleKeys,
  verifyGoogleIdToken,
} from '../modules/jobs/auth/google-oidc.js'
import { SCHEDULER_SERVICE_ACCOUNT_NAME } from '../modules/jobs/jobs.constants.js'
import { schedulerUnauthorized } from '../modules/jobs/jobs.errors.js'
import { PRODUCTION_API_URL } from '../shared/api-url.js'
import { forbidden } from '../shared/errors.js'
import { BEARER_HEADER } from './auth.js'

// E-mail da conta de serviço do Cloud Scheduler no projeto.
export function schedulerEmail(projectId: string): string {
  return `${SCHEDULER_SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`
}

// Exige que quem chama seja o Cloud Scheduler (RF-SIS-05): o token OIDC do Google
// no cabeçalho, emitido para a conta de serviço dele e para a audiência da API. Sem
// token, ou com token que não vale, 401; token válido de outra conta, 403. A sessão
// de um aluno ou de um bibliotecário nunca serve aqui.
export const requireScheduler: RequestHandler = async (req, _res, next) => {
  const token = BEARER_HEADER.exec(req.header('authorization') ?? '')?.[1]
  if (!token) throw schedulerUnauthorized()

  const verdict = await verifyGoogleIdToken(
    token,
    {
      audience: PRODUCTION_API_URL,
      email: schedulerEmail(env.GOOGLE_CLOUD_PROJECT),
    },
    googleKeys,
  )
  if (verdict === 'invalid') throw schedulerUnauthorized()
  if (verdict === 'other_identity') throw forbidden()
  next()
}
