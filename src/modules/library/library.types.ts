import type { z } from 'zod'
import type { libraryInfoSchema } from './schemas/response.schemas.js'

// Contrato de saída das informações da biblioteca.
export type LibraryInfo = z.infer<typeof libraryInfoSchema>
