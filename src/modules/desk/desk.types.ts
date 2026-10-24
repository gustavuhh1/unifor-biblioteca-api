import type { z } from 'zod'
import type {
  deskLookupBodySchema,
  pickupsQuerySchema,
  returnLoanBodySchema,
} from './schemas/request.schemas.js'
import type {
  deskLoanSchema,
  deskLookupResponseSchema,
  deskSummaryResponseSchema,
  pickupItemSchema,
  pickupResponseSchema,
  pickupsResponseSchema,
  returnResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo do balcão. Os documentos das coleções e os enums
// ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

// Corpo de POST /librarian/desk/lookup.
export type DeskLookupBody = z.infer<typeof deskLookupBodySchema>
// Corpo de POST /librarian/loans/:loanId/return.
export type ReturnLoanBody = z.infer<typeof returnLoanBodySchema>
// Query de GET /librarian/pickups.
export type PickupsQuery = z.infer<typeof pickupsQuerySchema>
// Um pedido ou empréstimo na ficha.
export type DeskLoan = z.infer<typeof deskLoanSchema>
// Resposta da ficha do aluno.
export type DeskLookupResponse = z.infer<typeof deskLookupResponseSchema>
// Resposta da retirada.
export type PickupResponse = z.infer<typeof pickupResponseSchema>
// Resposta da devolução.
export type ReturnResponse = z.infer<typeof returnResponseSchema>
// Um pedido na lista Retiradas.
export type PickupItem = z.infer<typeof pickupItemSchema>
// Resposta da lista Retiradas.
export type PickupsResponse = z.infer<typeof pickupsResponseSchema>
// Resposta do resumo do Painel.
export type DeskSummaryResponse = z.infer<typeof deskSummaryResponseSchema>
