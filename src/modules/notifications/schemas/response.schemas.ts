import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import {
  DEVICE_PLATFORMS,
  NOTIFICATION_ACTIONS,
  NOTIFICATION_TYPES,
} from '../../../shared/types/index.js'

// Schemas de saída do módulo de avisos. Também alimentam o Swagger. Data vai em
// ISO 8601 (UTC); campo que o aviso não tem vai como null.

// Um aviso dentro do app (RF-AVI-01).
export const notificationSchema = z
  .object({
    id: z.string(),
    type: z.enum(NOTIFICATION_TYPES),
    title: z.string(),
    body: z.string(),
    action: z.enum(NOTIFICATION_ACTIONS).meta({
      description:
        'O botão do aviso: `confirm_turn` (Vou retirar / Desistir), `show_qr`, `open_loan`, `open_fine` ou `none`.',
    }),
    bookId: z.string().nullable(),
    loanId: z.string().nullable(),
    queueEntryId: z.string().nullable(),
    fineId: z.string().nullable(),
    readAt: isoDate.nullable().meta({ description: 'Nulo: ainda não lido.' }),
    createdAt: isoDate,
  })
  .meta({ id: 'Notification' })

// Resposta de GET /me/notifications.
export const notificationsResponseSchema = z
  .object({
    items: z
      .array(notificationSchema)
      .meta({ description: 'Os avisos mais novos primeiro.' }),
    unreadCount: z.number().int().min(0).meta({
      description: 'Quantos dos avisos da lista ainda não foram lidos.',
    }),
  })
  .meta({ id: 'NotificationsResponse' })

// As preferências de aviso do aluno (RF-AVI-03).
export const notificationPrefsSchema = z
  .object({
    queueTurn: z.boolean().meta({ description: 'Sempre `true`.' }),
    overdueAndFines: z.boolean().meta({ description: 'Sempre `true`.' }),
    dueReminders: z.boolean(),
    pickupReady: z.boolean(),
    queueUpdates: z.boolean(),
    returnConfirmed: z.boolean(),
    channelPush: z.boolean(),
    channelEmail: z.boolean(),
  })
  .meta({ id: 'NotificationPrefs' })

// Um aparelho do aluno (RF-AVI-02).
export const deviceSchema = z
  .object({
    id: z.string(),
    platform: z.enum(DEVICE_PLATFORMS),
    deviceName: z.string().nullable(),
    appVersion: z.string().nullable(),
    pushEnabled: z.boolean().meta({
      description:
        '`true` quando o aparelho tem token do Expo que ainda vale (só no Android).',
    }),
    lastSeenAt: isoDate,
  })
  .meta({ id: 'Device' })
