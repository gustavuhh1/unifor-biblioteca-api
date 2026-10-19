import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { buildOpenApiDocument } from './openapi.js'

// Build the router only after every route module has registered its paths,
// because the document is generated once, here.
export function createDocsRouter(): Router {
  const router = Router()
  router.use(swaggerUi.serve)
  router.get('/', swaggerUi.setup(buildOpenApiDocument()))
  return router
}
