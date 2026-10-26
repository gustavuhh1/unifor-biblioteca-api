import { z } from 'zod'
import { JOB_NAMES } from '../../../shared/types/index.js'

// Schemas de entrada do módulo das rotinas.

// Parâmetro :job de POST /jobs/:job.
export const jobParamsSchema = z.object({
  job: z.enum(JOB_NAMES, 'Rotina desconhecida.').meta({
    description:
      '`expire_pickups`, `advance_queues`, `due_reminders`, `accrue_fines` ou `refresh_holidays`.',
  }),
})
