import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import '../modules/auth/auth.docs.js'
import { healthResponseSchema } from '../shared/health.js'
import { registry } from './registry.js'

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Sistema'],
  summary: 'Verifica se a API está no ar',
  responses: {
    200: {
      description: 'A API está funcionando.',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
})

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
