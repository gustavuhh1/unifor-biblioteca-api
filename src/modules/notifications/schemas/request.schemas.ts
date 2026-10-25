import { z } from 'zod'
import { DEVICE_PLATFORMS } from '../../../shared/types/index.js'
import {
  APP_VERSION_MAX_LENGTH,
  DEVICE_NAME_MAX_LENGTH,
  EXPO_PUSH_TOKEN_PATTERN,
} from '../notifications.constants.js'

// Schemas de entrada do módulo de avisos. As mensagens são em português.

// Parâmetro :deviceId das rotas de aparelho: o ID de instalação do app.
export const deviceParamsSchema = z.object({
  deviceId: z.string().min(1).max(100),
})

// Corpo de PUT /me/devices/:deviceId (RF-AVI-02). O token só vale no Android; no
// iPhone ele é ignorado.
export const deviceBodySchema = z
  .object({
    platform: z.enum(
      DEVICE_PLATFORMS,
      'Plataforma inválida: use android ou ios.',
    ),
    expoPushToken: z
      .string()
      .regex(EXPO_PUSH_TOKEN_PATTERN, 'Token de push inválido.')
      .optional()
      .meta({
        description: 'Token do Expo. Só o Android usa; no iPhone é ignorado.',
      }),
    deviceName: z.string().trim().min(1).max(DEVICE_NAME_MAX_LENGTH).optional(),
    appVersion: z.string().trim().min(1).max(APP_VERSION_MAX_LENGTH).optional(),
  })
  .meta({ id: 'DeviceBody' })

// Corpo de PATCH /me/notification-prefs (RF-AVI-03): só as chaves que mudam. "Sua
// vez na fila" e "Atraso e multa" ficam sempre ligados, então só aceitam `true`.
export const notificationPrefsBodySchema = z
  .object({
    queueTurn: z
      .literal(true, '"Sua vez na fila" fica sempre ligado.')
      .optional(),
    overdueAndFines: z
      .literal(true, '"Atraso e multa" fica sempre ligado.')
      .optional(),
    dueReminders: z.boolean().optional(),
    pickupReady: z.boolean().optional(),
    queueUpdates: z.boolean().optional(),
    returnConfirmed: z.boolean().optional(),
    channelPush: z.boolean().optional(),
    channelEmail: z.boolean().optional(),
  })
  .refine((prefs) => Object.keys(prefs).length > 0, {
    message: 'Informe ao menos um aviso para mudar.',
  })
  .meta({ id: 'NotificationPrefsBody' })
