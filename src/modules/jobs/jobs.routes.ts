import { Router } from 'express'
import { authenticateScheduler } from '../../middlewares/scheduler-auth.js'
import * as controller from './jobs.controller.js'

export const jobsRouter = Router()

jobsRouter.post('/internal/jobs/:job', authenticateScheduler, controller.run)
