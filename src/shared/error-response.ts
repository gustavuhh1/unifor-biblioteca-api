import { z } from 'zod'

// Body of every error the API answers (see middlewares/error-handler.ts).
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
  })
  .meta({
    id: 'ErrorResponse',
    example: {
      code: 'unauthorized',
      message: 'Sua sessão expirou ou é inválida. Entre novamente.',
    },
  })
