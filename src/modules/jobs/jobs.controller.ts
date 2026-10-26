import type { Request, Response } from 'express'
import { jobParamsSchema } from './schemas/request.schemas.js'
import { runJob } from './services/job-runner.service.js'

export async function run(req: Request, res: Response) {
  const { job } = jobParamsSchema.parse(req.params)
  res.json(await runJob(job))
}
