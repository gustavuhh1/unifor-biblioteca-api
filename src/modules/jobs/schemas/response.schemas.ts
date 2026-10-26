import { z } from 'zod'
import { JOB_NAMES } from '../../../shared/types/index.js'

export const jobResponseSchema = z.object({
  runId: z.string(),
  job: z.enum(JOB_NAMES),
  processed: z.number().int().min(0),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
})
