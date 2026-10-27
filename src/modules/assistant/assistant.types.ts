import type { z } from 'zod'
import type {
  assistantActionSchema,
  assistantMessageSchema,
  cancelActionResponseSchema,
  confirmActionResponseSchema,
  conversationResponseSchema,
  sendMessageResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo do Assistente. Os documentos (AssistantMessage,
// AssistantAction) ficam em shared/types.

export type AssistantActionResponse = z.infer<typeof assistantActionSchema>
export type AssistantMessageResponse = z.infer<typeof assistantMessageSchema>
export type ConversationResponse = z.infer<typeof conversationResponseSchema>
export type SendMessageResponse = z.infer<typeof sendMessageResponseSchema>
export type ConfirmActionResponse = z.infer<typeof confirmActionResponseSchema>
export type CancelActionResponse = z.infer<typeof cancelActionResponseSchema>
