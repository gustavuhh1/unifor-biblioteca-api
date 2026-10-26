import { getDb } from '../../../config/firebase.js'
import { localDate } from '../../../shared/calendar/dates.js'
import { nowOf } from '../../../shared/clock.js'
import { refreshHolidayYear } from '../../../shared/firestore/calendar.js'
import {
  readLoanSettings,
  type LoanSettings,
} from '../../../shared/firestore/settings.js'
import {
  JOB_NAME,
  JOB_STATUS,
  type JobName,
} from '../../../shared/types/index.js'
import { expireQueueTurns } from '../../queues/services/queue-turns.service.js'
import * as jobRunsRepository from '../repositories/job-runs.repository.js'
import { accrueFines } from './accrue-fines.service.js'
import { sendDueReminders } from './due-reminders.service.js'
import { expirePickups } from './expire-pickups.service.js'

async function execute(
  job: JobName,
  at: Date,
  settings: LoanSettings,
): Promise<number> {
  switch (job) {
    case JOB_NAME.expirePickups:
      return (await expirePickups(at, settings)).processed
    case JOB_NAME.advanceQueues:
      return (await expireQueueTurns(at)).processed
    case JOB_NAME.dueReminders:
      return (await sendDueReminders(at)).processed
    case JOB_NAME.accrueFines:
      return (await accrueFines(at, settings)).processed
    case JOB_NAME.refreshHolidays: {
      const nextYear = Number(localDate(at).slice(0, 4)) + 1
      return (await refreshHolidayYear(nextYear)) ? 1 : 0
    }
  }
}

export async function runJob(job: JobName) {
  const settings = await readLoanSettings()
  const startedAt = nowOf(settings)
  const runId = jobRunsRepository.newRunId()
  await getDb().runTransaction(async (tx) => {
    jobRunsRepository.create(tx, runId, {
      job,
      startedAt,
      status: JOB_STATUS.running,
      processed: 0,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
  })
  try {
    const processed = await execute(job, startedAt, settings)
    const finishedAt = new Date()
    await jobRunsRepository.update(runId, {
      status: JOB_STATUS.ok,
      processed,
      finishedAt,
      updatedAt: finishedAt,
    })
    return {
      runId,
      job,
      processed,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    }
  } catch (error) {
    const finishedAt = new Date()
    await jobRunsRepository.update(runId, {
      status: JOB_STATUS.error,
      finishedAt,
      updatedAt: finishedAt,
      error: (error instanceof Error ? error.message : String(error)).slice(
        0,
        1000,
      ),
    })
    throw error
  }
}
