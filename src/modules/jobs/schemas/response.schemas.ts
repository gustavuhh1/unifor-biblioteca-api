import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import { JOB_NAMES } from '../../../shared/types/index.js'

// Schemas de saída do módulo das rotinas. Também alimentam o Swagger.

// O resultado de uma execução (jobRuns, seção 2.23).
export const jobRunSchema = z
  .object({
    runId: z.string().meta({ description: 'O documento em `jobRuns`.' }),
    job: z.enum(JOB_NAMES),
    status: z.literal('ok'),
    processed: z.number().int().min(0).meta({
      description: 'Quantos documentos a rotina tratou nesta execução.',
    }),
    startedAt: isoDate,
    finishedAt: isoDate,
  })
  .meta({ id: 'JobRun' })
