import { z } from 'zod'

// Resposta do GET /health.
export const healthResponseSchema = z
  .object({ status: z.literal('ok') })
  .meta({ id: 'HealthResponse', example: { status: 'ok' } })
