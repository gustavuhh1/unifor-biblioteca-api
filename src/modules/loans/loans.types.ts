import type { z } from 'zod'
import type {
  LOAN_DISPLAY_STATES,
  LOAN_VIEWS,
  RENEWAL_DENIAL_REASONS,
} from './loans.constants.js'
import type {
  createLoanBodySchema,
  myLoansQuerySchema,
} from './schemas/request.schemas.js'
import type {
  loanSchema,
  myLoansResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo de empréstimos. Os documentos das coleções e os
// enums ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

// Corpo de POST /loans.
export type CreateLoanBody = z.infer<typeof createLoanBodySchema>
// Query de GET /me/loans.
export type MyLoansQuery = z.infer<typeof myLoansQuerySchema>
// Um pedido ou empréstimo na resposta.
export type LoanResponse = z.infer<typeof loanSchema>
// Resposta de GET /me/loans.
export type MyLoansResponse = z.infer<typeof myLoansResponseSchema>

// --- Constantes do módulo ----------------------------------------------------

// Aba de Meus empréstimos.
export type LoanView = (typeof LOAN_VIEWS)[number]
// Estado de um empréstimo mostrado ao aluno.
export type LoanDisplayState = (typeof LOAN_DISPLAY_STATES)[number]
// Motivo de a renovação ser negada.
export type RenewalDenialReason = (typeof RENEWAL_DENIAL_REASONS)[number]
