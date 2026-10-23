import { z } from 'zod'
import { FINE_STATUS, FINE_STATUSES } from '../../../shared/types/index.js'
import { SEARCH_MAX_LENGTH } from '../fines.constants.js'

// Schemas de entrada do módulo de multas. As mensagens são em português.

// Parâmetro :fineId das rotas de uma multa.
export const fineParamsSchema = z.object({
  fineId: z.string().min(1).max(200),
})

// Query de GET /librarian/fines (RF-BAL-09): a aba e a busca.
export const librarianFinesQuerySchema = z
  .object({
    status: z
      .enum(FINE_STATUSES, 'Aba inválida: use accruing, open ou paid.')
      .default(FINE_STATUS.open)
      .meta({
        description:
          'A aba: `open` (Em aberto, o padrão), `accruing` (Contando) ou `paid` (Pagas).',
      }),
    q: z
      .string()
      .trim()
      .max(
        SEARCH_MAX_LENGTH,
        `A busca deve ter no máximo ${SEARCH_MAX_LENGTH} caracteres.`,
      )
      .optional()
      .meta({
        description:
          'Busca por nome (parte do nome, sem acento nem maiúsculas) ou pela matrícula inteira. Vazia lista tudo.',
      }),
  })
  .meta({ id: 'LibrarianFinesQuery' })
