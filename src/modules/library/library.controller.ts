import type { Request, Response } from 'express'
import { getLibraryInfo } from './services/library-info.service.js'

// Cada handler chama o serviço e responde.

// GET /library/info: Regras da biblioteca (RF-PER-02).
export async function info(_req: Request, res: Response) {
  res.json(await getLibraryInfo())
}
