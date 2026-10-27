import { Router } from 'express'
import { studentSession } from '../../middlewares/session.js'
import * as controller from './assistant.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router do Assistente. Todas as rotas são só do aluno (RF-ASS-06): sem sessão,
// 401; bibliotecário, 403.
export const assistantRouter = Router()

// Conversa (RF-ASS-01 a RF-ASS-03, RF-ASS-05).
assistantRouter.get(
  '/me/assistant/messages',
  ...studentSession,
  controller.listMessages,
)
assistantRouter.post(
  '/me/assistant/messages',
  ...studentSession,
  controller.sendMessage,
)

// Ações com confirmação (RF-ASS-04).
assistantRouter.post(
  '/me/assistant/actions/:actionId/confirm',
  ...studentSession,
  controller.confirmAction,
)
assistantRouter.post(
  '/me/assistant/actions/:actionId/cancel',
  ...studentSession,
  controller.cancelAction,
)
