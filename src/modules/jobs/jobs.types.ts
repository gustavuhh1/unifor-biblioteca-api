import type { z } from 'zod'
import type { jobParamsSchema } from './schemas/request.schemas.js'
import type { jobRunSchema } from './schemas/response.schemas.js'

// Tipos exclusivos do módulo das rotinas. O documento (JobRun) e os enums
// (JobName, JobStatus) ficam em shared/types.

export type JobParams = z.infer<typeof jobParamsSchema>
export type JobRunResponse = z.infer<typeof jobRunSchema>

// O que uma rotina devolve ao terminar.
export interface JobResult {
  processed: number
}
