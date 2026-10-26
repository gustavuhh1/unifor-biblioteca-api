import type { Request, Response } from 'express'
import { jobParamsSchema } from './schemas/request.schemas.js'
import { runJob } from './services/job-run.service.js'

// Valida a rotina pedida, roda e responde. O erro de validação (ZodError) sobe para
// o handler de erros, que responde 400.

// POST /jobs/:job: roda uma rotina agendada (RF-SIS-05).
export async function run(req: Request, res: Response) {
  const { job } = jobParamsSchema.parse(req.params)
  res.json(await runJob(job))
}
