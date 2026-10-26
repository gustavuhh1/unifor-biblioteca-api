import { Router } from 'express'
import { requireScheduler } from '../../middlewares/scheduler-auth.js'
import * as controller from './jobs.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router das rotinas agendadas. A única rota é do Cloud Scheduler: `requireScheduler`
// confere o token OIDC dele, e a sessão do app nunca vale aqui.
export const jobsRouter = Router()

jobsRouter.post('/jobs/:job', requireScheduler, controller.run)
