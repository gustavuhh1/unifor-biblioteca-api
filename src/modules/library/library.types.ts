import type { z } from 'zod'
import type { libraryInfoResponseSchema } from './schemas/response.schemas.js'

// Tipos exclusivos do módulo da biblioteca. Os documentos das coleções e os enums
// ficam em shared/types.

// Resposta de GET /library/info.
export type LibraryInfoResponse = z.infer<typeof libraryInfoResponseSchema>
