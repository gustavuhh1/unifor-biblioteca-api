import { Router } from 'express'
import { studentSession } from '../../middlewares/session.js'
import * as controller from './notifications.controller.js'

// Só o caminho e os middlewares de cada rota; a lógica fica no controller.

// Router do módulo de avisos. Todas as rotas são do aluno. O envio por push e por
// e-mail não tem rota: sai sozinho quando algo grava um aviso.
export const notificationsRouter = Router()

// Notificações dentro do app (RF-AVI-01).
notificationsRouter.get(
  '/me/notifications',
  ...studentSession,
  controller.listNotifications,
)
notificationsRouter.post(
  '/me/notifications/read-all',
  ...studentSession,
  controller.readAll,
)

// Preferências de aviso (RF-AVI-03).
notificationsRouter.patch(
  '/me/notification-prefs',
  ...studentSession,
  controller.updatePrefs,
)

// Aparelhos para o push (RF-AVI-02).
notificationsRouter.put(
  '/me/devices/:deviceId',
  ...studentSession,
  controller.registerDevice,
)
notificationsRouter.delete(
  '/me/devices/:deviceId',
  ...studentSession,
  controller.removeDevice,
)
