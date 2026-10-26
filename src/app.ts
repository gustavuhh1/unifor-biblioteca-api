import express from 'express'
import { createDocsRouter } from './docs/swagger.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import { deliverNoticesBeforeResponse } from './middlewares/notice-delivery.js'
import { createRequestLogger } from './middlewares/request-logger.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { catalogRouter } from './modules/catalog/catalog.routes.js'
import { deskRouter } from './modules/desk/desk.routes.js'
import { finesRouter } from './modules/fines/fines.routes.js'
import { jobsRouter } from './modules/jobs/jobs.routes.js'
import { loansRouter } from './modules/loans/loans.routes.js'
import { queuesRouter } from './modules/queues/queues.routes.js'
import { notificationsRouter } from './modules/notifications/notifications.routes.js'
import { savedRouter } from './modules/saved/saved.routes.js'
import { healthResponseSchema } from './shared/health.js'

// Aplicação Express da API: middlewares, /health, módulos, /docs e erros.
export const app = express()

app.disable('x-powered-by')
app.use(createRequestLogger())
app.use(express.json())
app.use(deliverNoticesBeforeResponse)

app.get('/health', (_req, res) => {
  res.json(healthResponseSchema.parse({ status: 'ok' }))
})

app.use(authRouter)
app.use(catalogRouter)
app.use(loansRouter)
app.use(queuesRouter)
app.use(finesRouter)
app.use(deskRouter)
app.use(savedRouter)
app.use(notificationsRouter)
app.use(jobsRouter)

// Os routers dos módulos são montados acima desta linha, para que a
// documentação deles seja registrada antes de o Swagger ser gerado.
app.use('/docs', createDocsRouter())

app.use(notFoundHandler)
app.use(errorHandler)
