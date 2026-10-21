import { z } from 'zod'
import { unauthorized } from './errors.js'

// Corpo de todo erro que a API responde (veja middlewares/error-handler.ts).
export const errorResponseSchema = z
  .object({
    code: z.string().meta({ description: 'Identificador estável, em inglês.' }),
    message: z
      .string()
      .meta({ description: 'Texto em português para o usuário.' }),
    fields: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .meta({ description: 'Campos errados, para o app marcar na tela.' }),
    retryAfterSeconds: z.number().int().optional(),
    suggestion: z.string().optional().meta({
      description:
        'O que fazer no lugar, como código estável (ex.: `mark_unavailable`).',
    }),
  })
  .meta({
    id: 'ErrorResponse',
    example: { code: unauthorized().code, message: unauthorized().message },
  })
