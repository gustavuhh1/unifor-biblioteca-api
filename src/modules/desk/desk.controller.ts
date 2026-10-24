import type { Request, Response } from 'express'
import { deskLookupBodySchema } from './schemas/request.schemas.js'
import * as deskLookupService from './services/desk-lookup.service.js'

// Cada handler valida a entrada com o schema, chama o serviço e responde. O erro
// de validação (ZodError) sobe para o handler de erros, que responde 400.

// POST /librarian/desk/lookup: ficha do aluno por QR, código ou matrícula
// (RF-BAL-02, RF-BAL-03).
export async function lookup(req: Request, res: Response) {
  const body = deskLookupBodySchema.parse(req.body)
  res.json(await deskLookupService.lookupStudent(body))
}
