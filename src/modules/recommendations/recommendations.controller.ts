import type { Request, Response } from 'express'
import { unauthorized } from '../../shared/errors.js'
import { listRecommendations } from './services/recommendations.service.js'

// GET /me/recommendations: só as sugestões de quem está logado (RF-ASS-03).
export async function list(req: Request, res: Response) {
  if (!req.user) throw unauthorized()
  res.json(await listRecommendations(req.user.uid))
}
