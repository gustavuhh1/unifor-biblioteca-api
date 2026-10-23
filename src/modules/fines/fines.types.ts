import type { z } from 'zod'
import type {
  fineParamsSchema,
  librarianFinesQuerySchema,
} from './schemas/request.schemas.js'
import type {
  fineSchema,
  librarianFineSchema,
  librarianFinesResponseSchema,
  myFinesResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo de multas. Os documentos das coleções e os enums
// ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

// Parâmetros de /librarian/fines/:fineId/pay.
export type FineParams = z.infer<typeof fineParamsSchema>
// Query de GET /librarian/fines.
export type LibrarianFinesQuery = z.infer<typeof librarianFinesQuerySchema>
// Uma multa na resposta.
export type FineResponse = z.infer<typeof fineSchema>
// Resposta de GET /me/fines.
export type MyFinesResponse = z.infer<typeof myFinesResponseSchema>
// Uma multa na aba Multas do bibliotecário.
export type LibrarianFineResponse = z.infer<typeof librarianFineSchema>
// Resposta de GET /librarian/fines.
export type LibrarianFinesResponse = z.infer<
  typeof librarianFinesResponseSchema
>
