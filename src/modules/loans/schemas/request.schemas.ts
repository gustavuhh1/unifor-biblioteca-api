import { z } from 'zod'
import { bookParamsSchema } from '../../catalog/schemas/request.schemas.js'
import { LOAN_VIEW, LOAN_VIEWS } from '../loans.constants.js'

// Schemas de entrada do módulo de empréstimos. As mensagens são em português.

// Corpo de POST /loans (RF-EMP-01): o livro (edição) que o aluno quer pedir.
export const createLoanBodySchema = z
  .object({ bookId: bookParamsSchema.shape.bookId })
  .meta({ id: 'CreateLoanBody' })

// Parâmetro :loanId das rotas de um pedido ou empréstimo.
export const loanParamsSchema = z.object({
  loanId: z.string().min(1).max(200),
})

// Query de GET /me/loans (RF-EMP-08).
export const myLoansQuerySchema = z
  .object({
    view: z
      .enum(LOAN_VIEWS, 'Aba inválida: use active ou history.')
      .default(LOAN_VIEW.active)
      .meta({
        description:
          '`active`: pedidos para retirar e empréstimos ativos. `history`: devolvidos, expirados e cancelados.',
      }),
  })
  .meta({ id: 'MyLoansQuery' })
