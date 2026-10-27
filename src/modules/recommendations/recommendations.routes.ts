import { Router } from 'express'
import { studentSession } from '../../middlewares/session.js'
import * as controller from './recommendations.controller.js'

// Recomendações exclusivas do aluno (RF-ASS-03).
export const recommendationsRouter = Router()
recommendationsRouter.get(
  '/me/recommendations',
  ...studentSession,
  controller.list,
)
