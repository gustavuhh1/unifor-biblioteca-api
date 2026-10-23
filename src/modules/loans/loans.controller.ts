import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import {
  createLoanBodySchema,
  loanParamsSchema,
  myLoansQuerySchema,
} from './schemas/request.schemas.js'
import * as loanCancelService from './services/loan-cancel.service.js'
import * as loanRenewService from './services/loan-renew.service.js'
import * as loanRequestService from './services/loan-request.service.js'
import * as myLoansService from './services/my-loans.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid do aluno logado (as rotas passam antes pelo authenticate e requireRole).
function studentUidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// POST /loans: solicita um empréstimo (RF-EMP-01).
export async function requestLoan(req: Request, res: Response) {
  const body = createLoanBodySchema.parse(req.body)
  res
    .status(201)
    .json(await loanRequestService.requestLoan(studentUidOf(req), body))
}

// GET /me/loans: Meus empréstimos (RF-EMP-08).
export async function listMyLoans(req: Request, res: Response) {
  const { view } = myLoansQuerySchema.parse(req.query)
  res.json(await myLoansService.listMyLoans(studentUidOf(req), view))
}

// POST /loans/:loanId/cancel: cancela um pedido antes da retirada (RF-EMP-05).
export async function cancelLoan(req: Request, res: Response) {
  const { loanId } = loanParamsSchema.parse(req.params)
  res.json(await loanCancelService.cancelLoan(studentUidOf(req), loanId))
}

// POST /loans/:loanId/renew: renova um empréstimo (RF-EMP-09, RF-EMP-10).
export async function renewLoan(req: Request, res: Response) {
  const { loanId } = loanParamsSchema.parse(req.params)
  res.json(await loanRenewService.renewLoan(studentUidOf(req), loanId))
}
