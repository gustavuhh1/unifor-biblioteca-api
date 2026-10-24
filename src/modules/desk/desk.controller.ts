import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import { loanParamsSchema } from '../loans/schemas/request.schemas.js'
import {
  deskLookupBodySchema,
  returnLoanBodySchema,
} from './schemas/request.schemas.js'
import * as deskLookupService from './services/desk-lookup.service.js'
import * as loanPickupService from './services/loan-pickup.service.js'
import * as loanReturnService from './services/loan-return.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid do bibliotecário logado (as rotas passam antes pelo authenticate e
// requireRole).
function librarianUidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// POST /librarian/desk/lookup: ficha do aluno por QR, código ou matrícula
// (RF-BAL-02, RF-BAL-03).
export async function lookup(req: Request, res: Response) {
  const body = deskLookupBodySchema.parse(req.body)
  res.json(await deskLookupService.lookupStudent(body))
}

// POST /librarian/loans/:loanId/pickup: registra a retirada (RF-BAL-02).
export async function pickup(req: Request, res: Response) {
  const { loanId } = loanParamsSchema.parse(req.params)
  res.json(await loanPickupService.registerPickup(librarianUidOf(req), loanId))
}

// POST /librarian/loans/:loanId/return: registra a devolução, com a chave "Multa
// paga agora" opcional (RF-BAL-04, RF-BAL-08). O corpo pode vir vazio.
export async function returnLoan(req: Request, res: Response) {
  const { loanId } = loanParamsSchema.parse(req.params)
  const body = returnLoanBodySchema.parse(req.body ?? {})
  res.json(
    await loanReturnService.registerReturn(librarianUidOf(req), loanId, body),
  )
}
