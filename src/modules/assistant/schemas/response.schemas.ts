import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import {
  ASSISTANT_ACTION_STATUSES,
  ASSISTANT_ACTION_TYPES,
  ASSISTANT_SENDERS,
  BLOCKED_REASONS,
} from '../../../shared/types/index.js'
import { bookSummarySchema } from '../../catalog/schemas/response.schemas.js'
import { loanSchema } from '../../loans/schemas/response.schemas.js'
import { queueEntrySchema } from '../../queues/schemas/response.schemas.js'

// Schemas de saída do módulo do Assistente. Também alimentam o Swagger. Data vai
// em ISO 8601 (UTC); campo que não se aplica vai como null.

// O que o cartão da ação mostra antes da confirmação (seção 2.17).
export const assistantActionPreviewSchema = z
  .object({
    pickupDeadline: isoDate
      .nullable()
      .meta({ description: 'Pedido: até quando retirar no balcão.' }),
    activeLoansAfter: z
      .number()
      .int()
      .nullable()
      .meta({ description: 'Pedido: quantos livros o aluno terá depois.' }),
    queuePosition: z
      .number()
      .int()
      .nullable()
      .meta({ description: 'Fila: a posição que o aluno vai ocupar.' }),
  })
  .meta({ id: 'AssistantActionPreview' })

// Ação proposta pelo Assistente (RF-ASS-04).
export const assistantActionSchema = z
  .object({
    id: z.string(),
    type: z.enum(ASSISTANT_ACTION_TYPES),
    status: z.enum(ASSISTANT_ACTION_STATUSES),
    books: z.array(bookSummarySchema),
    blockedReason: z.enum(BLOCKED_REASONS).nullable(),
    blockedMessage: z
      .string()
      .nullable()
      .meta({ description: 'Por que a regra bloqueia, para o aluno ler.' }),
    preview: assistantActionPreviewSchema,
    expiresAt: isoDate,
    resultLoanId: z.string().nullable(),
    resultQueueEntryIds: z.array(z.string()),
  })
  .meta({ id: 'AssistantAction' })

// Uma mensagem da conversa (seção 2.16).
export const assistantMessageSchema = z
  .object({
    id: z.string(),
    sender: z.enum(ASSISTANT_SENDERS),
    text: z.string(),
    suggestedBooks: z
      .array(bookSummarySchema)
      .meta({ description: 'Livros mostrados como cartões (RF-ASS-02).' }),
    action: assistantActionSchema.nullable(),
    blockedReason: z
      .string()
      .nullable()
      .meta({ description: 'Quando uma regra bloqueia o pedido (tela A81).' }),
    error: z.boolean().meta({
      description: 'O Assistente não conseguiu responder (tela A49).',
    }),
    createdAt: isoDate,
  })
  .meta({ id: 'AssistantMessage' })

// Resposta de GET /me/assistant/messages.
export const conversationResponseSchema = z
  .object({
    disclaimer: z
      .string()
      .meta({ description: 'Aviso de que a IA pode errar.' }),
    items: z.array(assistantMessageSchema),
  })
  .meta({ id: 'AssistantConversation' })

// Resposta de POST /me/assistant/messages: a pergunta salva e a resposta.
export const sendMessageResponseSchema = z
  .object({
    disclaimer: z.string(),
    question: assistantMessageSchema,
    reply: assistantMessageSchema,
  })
  .meta({ id: 'AssistantReply' })

// Resposta de POST /me/assistant/actions/:actionId/confirm.
export const confirmActionResponseSchema = z
  .object({
    action: assistantActionSchema,
    loan: loanSchema.nullable(),
    queueEntries: z.array(queueEntrySchema),
  })
  .meta({ id: 'AssistantActionConfirmed' })

// Resposta de POST /me/assistant/actions/:actionId/cancel.
export const cancelActionResponseSchema = z
  .object({ action: assistantActionSchema })
  .meta({ id: 'AssistantActionCancelled' })
