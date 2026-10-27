import { z } from 'zod'
import { isoDateSchema } from '../../../shared/iso-date.js'
import { bookSummarySchema } from '../../catalog/schemas/response.schemas.js'
import { RECOMMENDATIONS_LIMIT } from '../recommendations.constants.js'

// Livro sugerido com o motivo individual baseado no histórico (RF-ASS-03).
export const recommendationItemSchema = z
  .object({
    book: bookSummarySchema,
    reasonText: z.string(),
  })
  .meta({ id: 'RecommendationItem' })

// Recomendados para você, incluindo a validade da escolha em cache (RF-ASS-03).
export const recommendationsResponseSchema = z
  .object({
    reasonText: z.string().nullable(),
    items: z.array(recommendationItemSchema).max(RECOMMENDATIONS_LIMIT),
    generatedAt: isoDateSchema,
    validUntil: isoDateSchema,
  })
  .meta({ id: 'RecommendationsResponse' })
