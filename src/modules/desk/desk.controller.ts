import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import {
  deskLoanParamsSchema,
  pickupsQuerySchema,
  returnBodySchema,
  studentLookupQuerySchema,
} from './schemas/request.schemas.js'
import {
  getDashboard,
  listPendingPickups,
  lookupStudent,
} from './services/desk-query.service.js'
import { registerPickup } from './services/loan-pickup.service.js'
import { registerReturn } from './services/loan-return.service.js'

function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

export async function dashboard(_req: Request, res: Response) {
  res.json(await getDashboard())
}

export async function pickups(req: Request, res: Response) {
  const { matricula } = pickupsQuerySchema.parse(req.query)
  res.json(await listPendingPickups(matricula))
}

export async function student(req: Request, res: Response) {
  const { identifier } = studentLookupQuerySchema.parse(req.query)
  res.json(await lookupStudent(identifier))
}

export async function pickup(req: Request, res: Response) {
  const { loanId } = deskLoanParamsSchema.parse(req.params)
  res.json(await registerPickup(uidOf(req), loanId))
}

export async function returnLoan(req: Request, res: Response) {
  const { loanId } = deskLoanParamsSchema.parse(req.params)
  const { paidNow } = returnBodySchema.parse(req.body ?? {})
  res.json(await registerReturn(uidOf(req), loanId, paidNow))
}
