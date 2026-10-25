import { localDate } from '../../../shared/calendar/dates.js'
import { refreshHolidays } from '../../../shared/firestore/calendar.js'
import { JOB_NAME, type JobName } from '../../../shared/types/index.js'
import { accrueFines } from '../../fines/services/fine-accrue.service.js'
import { expirePickups } from '../../loans/services/loan-expire.service.js'
import { sendDueReminders } from '../../loans/services/loan-reminders.service.js'
import { expireQueueTurns } from '../../queues/services/queue-turns.service.js'
import type { JobResult } from '../jobs.types.js'

// O que cada rotina agendada faz (seção 2.23). Todas recebem o "agora" das regras de
// negócio e devolvem quantos documentos trataram.

// Garante os feriados do ano de hoje e do próximo (RF-SIS-01).
async function refreshHolidayYears(at: Date): Promise<number> {
  const year = Number(localDate(at).slice(0, 4))
  let fetched = 0
  for (const target of [year, year + 1]) {
    if (await refreshHolidays(target)) fetched++
  }
  return fetched
}

export const JOB_RUNNERS: Record<JobName, (at: Date) => Promise<JobResult>> = {
  [JOB_NAME.expirePickups]: async (at) => ({
    processed: await expirePickups(at),
  }),
  [JOB_NAME.advanceQueues]: async (at) => ({
    processed: (await expireQueueTurns(at)).processed,
  }),
  [JOB_NAME.dueReminders]: async (at) => ({
    processed: await sendDueReminders(at),
  }),
  [JOB_NAME.accrueFines]: async (at) => ({ processed: await accrueFines(at) }),
  [JOB_NAME.refreshHolidays]: async (at) => ({
    processed: await refreshHolidayYears(at),
  }),
}
