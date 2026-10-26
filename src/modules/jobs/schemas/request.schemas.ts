import { z } from 'zod'
import { JOB_NAMES } from '../../../shared/types/index.js'

export const jobParamsSchema = z.object({ job: z.enum(JOB_NAMES) })
