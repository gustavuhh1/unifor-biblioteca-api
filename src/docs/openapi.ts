import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import '../modules/auth/auth.docs.js'
import '../modules/catalog/catalog.docs.js'
import '../modules/loans/loans.docs.js'
import '../modules/queues/queues.docs.js'
import '../modules/fines/fines.docs.js'
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

// Gera o documento OpenAPI 3.1 com todas as rotas registradas até aqui.
export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Unifor Biblioteca API',
      version: '0.1.0',
      description: 'API REST do app de biblioteca universitária Unifor Biblioteca.',
    },
  })
}
