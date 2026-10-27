import type { Request, Response } from 'express'
import { getLibraryInfo } from './services/library.service.js'

// GET /library/info: regras e contatos para os dois perfis (RF-PER-02).
export async function info(_req: Request, res: Response) {
  res.json(await getLibraryInfo())
}
