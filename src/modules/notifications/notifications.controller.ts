import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import {
  deviceBodySchema,
  deviceParamsSchema,
  notificationPrefsBodySchema,
} from './schemas/request.schemas.js'
import * as devices from './services/devices.service.js'
import * as prefs from './services/notification-prefs.service.js'
import * as notifications from './services/notifications.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid de quem está logado (as rotas passam antes pelo authenticate e requireRole).
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// GET /me/notifications: as notificações do aluno (RF-AVI-01).
export async function listNotifications(req: Request, res: Response) {
  res.json(await notifications.listMyNotifications(uidOf(req)))
}

// POST /me/notifications/read-all: marca todas como lidas (RF-AVI-01).
export async function readAll(req: Request, res: Response) {
  await notifications.markAllRead(uidOf(req))
  res.status(204).end()
}

// PATCH /me/notification-prefs: liga e desliga avisos e canais (RF-AVI-03).
export async function updatePrefs(req: Request, res: Response) {
  const changes = notificationPrefsBodySchema.parse(req.body)
  res.json(await prefs.updateNotificationPrefs(uidOf(req), changes))
}

// PUT /me/devices/:deviceId: registra o aparelho para o push (RF-AVI-02).
export async function registerDevice(req: Request, res: Response) {
  const { deviceId } = deviceParamsSchema.parse(req.params)
  const body = deviceBodySchema.parse(req.body)
  res.json(await devices.registerDevice(uidOf(req), deviceId, body))
}

// DELETE /me/devices/:deviceId: remove o aparelho (RF-AVI-02).
export async function removeDevice(req: Request, res: Response) {
  const { deviceId } = deviceParamsSchema.parse(req.params)
  await devices.removeDevice(uidOf(req), deviceId)
  res.status(204).end()
}
