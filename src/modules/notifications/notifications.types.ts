import type { z } from 'zod'
import type {
  deviceBodySchema,
  deviceParamsSchema,
  notificationPrefsBodySchema,
} from './schemas/request.schemas.js'
import type {
  deviceSchema,
  notificationPrefsSchema,
  notificationSchema,
  notificationsResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo de avisos. Os documentos (UserNotification, Device,
// NotificationPrefs) e os enums ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

export type DeviceParams = z.infer<typeof deviceParamsSchema>
export type DeviceBody = z.infer<typeof deviceBodySchema>
export type NotificationPrefsBody = z.infer<typeof notificationPrefsBodySchema>
export type NotificationResponse = z.infer<typeof notificationSchema>
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>
export type NotificationPrefsResponse = z.infer<typeof notificationPrefsSchema>
export type DeviceResponse = z.infer<typeof deviceSchema>
