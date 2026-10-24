import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import {
  fineParamsSchema,
  librarianFinesQuerySchema,
} from './schemas/request.schemas.js'
import { payFine } from './services/fine-pay.service.js'
import { listLibrarianFines } from './services/librarian-fines.service.js'
import { listMyFines } from './services/my-fines.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// O uid de quem está logado (as rotas passam antes pelo authenticate e requireRole).
function uidOf(req: Request): string {
  if (!req.user) throw unauthorized()
  return req.user.uid
}

// GET /me/fines: Minhas multas (RF-MUL-03, RF-MUL-04).
export async function listMine(req: Request, res: Response) {
  res.json(await listMyFines(uidOf(req)))
}

// GET /librarian/fines: aba Multas (RF-BAL-09).
export async function listAll(req: Request, res: Response) {
  const query = librarianFinesQuerySchema.parse(req.query)
  res.json(await listLibrarianFines(query))
}

// POST /librarian/fines/:fineId/pay: registra o pagamento no balcão (RF-BAL-09).
export async function pay(req: Request, res: Response) {
  const { fineId } = fineParamsSchema.parse(req.params)
  res.json(await payFine(uidOf(req), fineId))
}
