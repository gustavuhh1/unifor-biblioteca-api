import express from 'express'
import { createDocsRouter } from './docs/swagger.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { healthResponseSchema } from './shared/health.js'

export const app = express()

app.disable('x-powered-by')
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json(healthResponseSchema.parse({ status: 'ok' }))
})

app.use(authRouter)

// Module routers are mounted above this line, so their docs are registered first.
app.use('/docs', createDocsRouter())

app.use(notFoundHandler)
app.use(errorHandler)
