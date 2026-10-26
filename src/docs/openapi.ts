import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import '../modules/auth/auth.docs.js'
import '../modules/catalog/catalog.docs.js'
import '../modules/loans/loans.docs.js'
import '../modules/queues/queues.docs.js'
import '../modules/fines/fines.docs.js'
import '../modules/desk/desk.docs.js'
import '../modules/saved/saved.docs.js'
import '../modules/notifications/notifications.docs.js'
import '../modules/jobs/jobs.docs.js'
import { env } from '../config/env.js'
import { PRODUCTION_API_URL } from '../shared/api-url.js'
import { healthResponseSchema } from '../shared/health.js'
import { jsonContent, registry } from './registry.js'

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Sistema'],
  summary: 'Verifica se a API está no ar',
  responses: {
    200: {
      description: 'A API está funcionando.',
      content: jsonContent(healthResponseSchema),
    },
  },
})

const PRODUCTION_SERVER = {
  url: PRODUCTION_API_URL,
  description: 'Produção',
}
const LOCAL_SERVER = { url: 'http://localhost:8080', description: 'Local' }

// Gera o documento OpenAPI 3.1 com todas as rotas registradas até aqui. O
// Swagger UI chama o primeiro servidor da lista: em produção é a própria API;
// no desenvolvimento é a local, para ninguém testar na produção sem querer.
export function buildOpenApiDocument(nodeEnv: string = env.NODE_ENV) {
  const servers =
    nodeEnv === 'production'
      ? [PRODUCTION_SERVER, LOCAL_SERVER]
      : [LOCAL_SERVER, PRODUCTION_SERVER]
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Unifor Biblioteca API',
      version: '0.1.0',
      description: 'API REST do app de biblioteca universitária Unifor Biblioteca.',
    },
    servers,
  })
}
