import type { RequestHandler } from 'express'
import type { IncomingMessage } from 'node:http'
import morgan from 'morgan'
import { env, type Env } from '../config/env.js'

// Formato do log de requisições: legível no terminal em desenvolvimento e
// "short" em produção (o Cloud Run guarda a saída padrão). Nenhum dos dois
// registra corpo nem cabeçalhos.
export function requestLogFormat(nodeEnv: Env['NODE_ENV']): 'dev' | 'short' {
  return nodeEnv === 'production' ? 'short' : 'dev'
}

// Diz se a requisição fica fora do log: só o GET /health (com ou sem query
// string), para não poluir a saída com as checagens de saúde.
export function shouldSkipRequestLog(
  req: Pick<IncomingMessage, 'method' | 'url'>,
) {
  return req.method === 'GET' && req.url?.split('?')[0] === '/health'
}

// Middleware que registra cada requisição na saída padrão. Use antes das rotas.
export function createRequestLogger(
  nodeEnv: Env['NODE_ENV'] = env.NODE_ENV,
): RequestHandler {
  return morgan(requestLogFormat(nodeEnv), { skip: shouldSkipRequestLog })
}
