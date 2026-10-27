import type { z } from 'zod'
import type {
  recommendationItemSchema,
  recommendationsResponseSchema,
} from './schemas/response.schemas.js'

// Contratos de saída das sugestões do aluno.
export type RecommendationItem = z.infer<typeof recommendationItemSchema>
export type RecommendationsResponse = z.infer<
  typeof recommendationsResponseSchema
>
