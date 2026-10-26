import { AppError } from '../../shared/errors.js'

// Erros do módulo das rotinas. O code é estável e em inglês; a mensagem é em
// português.

// 401: a chamada não traz um token do Google válido (sem cabeçalho, assinatura,
// audiência ou validade errada).
export function schedulerUnauthorized(): AppError {
  return new AppError(
    401,
    'scheduler_unauthorized',
    'Esta rota é só do Cloud Scheduler.',
  )
}

// 500: a rotina falhou. O erro fica em jobRuns.
export function jobFailed(): AppError {
  return new AppError(
    500,
    'job_failed',
    'A rotina falhou. O erro está registrado em jobRuns.',
  )
}
