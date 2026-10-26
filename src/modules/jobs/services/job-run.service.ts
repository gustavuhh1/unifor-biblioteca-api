import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { JOB_STATUS, type JobName } from '../../../shared/types/index.js'
import { JOB_ERROR_MAX_LENGTH } from '../jobs.constants.js'
import { jobFailed } from '../jobs.errors.js'
import type { JobRunResponse } from '../jobs.types.js'
import * as jobRunsRepository from '../repositories/job-runs.repository.js'
import { JOB_RUNNERS } from './job-runners.js'

// Roda uma rotina agendada e a registra em jobRuns (RF-SIS-05, seção 2.23). O
// registro abre como `running` antes de começar e fecha como `ok` (com quantos
// documentos tratou) ou `error` (com a mensagem, sem dados de aluno). Se a rotina
// falha, o erro é registrado e a chamada responde 500 (`job_failed`), para o
// Cloud Scheduler tentar de novo conforme a configuração dele.
export async function runJob(job: JobName): Promise<JobRunResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)
  const startedAt = new Date()
  const runId = await jobRunsRepository.start({
    job,
    startedAt,
    status: JOB_STATUS.running,
    processed: 0,
    createdAt: startedAt,
    updatedAt: startedAt,
  })

  try {
    const { processed } = await JOB_RUNNERS[job](at)
    const finishedAt = new Date()
    await jobRunsRepository.finish(runId, {
      status: JOB_STATUS.ok,
      processed,
      finishedAt,
      updatedAt: finishedAt,
    })
    return {
      runId,
      job,
      status: JOB_STATUS.ok,
      processed,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    }
  } catch (error) {
    const finishedAt = new Date()
    const reason = error instanceof Error ? error.message : 'erro desconhecido'
    console.error(`A rotina ${job} falhou:`, reason)
    await jobRunsRepository.finish(runId, {
      status: JOB_STATUS.error,
      processed: 0,
      error: reason.slice(0, JOB_ERROR_MAX_LENGTH),
      finishedAt,
      updatedAt: finishedAt,
    })
    throw jobFailed()
  }
}
