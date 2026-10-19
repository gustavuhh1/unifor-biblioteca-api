import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { buildOpenApiDocument } from './openapi.js'

// Cria o router do /docs (Swagger UI). Chame só depois de todos os módulos
// registrarem suas rotas, porque o documento é gerado uma vez, aqui.
export function createDocsRouter(): Router {
  const router = Router()
  router.use(swaggerUi.serve)
  router.get('/', swaggerUi.setup(buildOpenApiDocument()))
  return router
}
