import express from 'express'
import { createDocsRouter } from './docs/swagger.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { healthResponseSchema } from './shared/health.js'

// Aplicação Express da API: middlewares, /health, módulos, /docs e erros.
export const app = express()

app.disable('x-powered-by')
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json(healthResponseSchema.parse({ status: 'ok' }))
})

app.use(authRouter)

// Os routers dos módulos são montados acima desta linha, para que a
// documentação deles seja registrada antes de o Swagger ser gerado.
app.use('/docs', createDocsRouter())

app.use(notFoundHandler)
app.use(errorHandler)
