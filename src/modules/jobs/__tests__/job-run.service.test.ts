import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  expirePickups: vi.fn(),
  expireQueueTurns: vi.fn(),
  sendDueReminders: vi.fn(),
  accrueFines: vi.fn(),
  refreshHolidays: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../../loans/services/loan-expire.service.js', () => ({
  expirePickups: h.expirePickups,
}))
vi.mock('../../queues/services/queue-turns.service.js', () => ({
  expireQueueTurns: h.expireQueueTurns,
}))
vi.mock('../../loans/services/loan-reminders.service.js', () => ({
  sendDueReminders: h.sendDueReminders,
}))
vi.mock('../../fines/services/fine-accrue.service.js', () => ({
  accrueFines: h.accrueFines,
}))
vi.mock('../../../shared/firestore/calendar.js', () => ({
  refreshHolidays: h.refreshHolidays,
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { runJob } = await import('../services/job-run.service.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { JOB_NAMES } = await import('../../../shared/types/index.js')

const NOW = new Date('2026-10-26T09:00:00Z')

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.expirePickups.mockReset().mockResolvedValue(3)
  h.expireQueueTurns
    .mockReset()
    .mockResolvedValue({ processed: 2, entryIds: ['a', 'b'] })
  h.sendDueReminders.mockReset().mockResolvedValue(5)
  h.accrueFines.mockReset().mockResolvedValue(1)
  h.refreshHolidays.mockReset().mockResolvedValue(false)
})

describe('executar uma rotina e registrar em jobRuns (runJob, RF-SIS-05)', () => {
  it('chama a rotina certa com o "agora" e devolve quantos documentos tratou', async () => {
    const result = await runJob('expire_pickups')

    expect(h.expirePickups).toHaveBeenCalledWith(NOW)
    expect(result).toMatchObject({
      job: 'expire_pickups',
      status: 'ok',
      processed: 3,
      startedAt: NOW.toISOString(),
      finishedAt: NOW.toISOString(),
    })
  })

  it('cada nome de rotina chama a sua função', async () => {
    const calls = {
      expire_pickups: h.expirePickups,
      advance_queues: h.expireQueueTurns,
      due_reminders: h.sendDueReminders,
      accrue_fines: h.accrueFines,
    } as const

    for (const [job, mock] of Object.entries(calls)) {
      await runJob(job as keyof typeof calls)
      expect(mock, job).toHaveBeenCalledTimes(1)
    }
    expect(JOB_NAMES).toHaveLength(5)
  })

  it('advance_queues conta as vezes vencidas', async () => {
    expect((await runJob('advance_queues')).processed).toBe(2)
  })

  it('refresh_holidays conta os anos que buscou, hoje e o próximo', async () => {
    h.refreshHolidays.mockImplementation(async (year: number) => year === 2027)

    const result = await runJob('refresh_holidays')

    expect(h.refreshHolidays).toHaveBeenCalledWith(2026)
    expect(h.refreshHolidays).toHaveBeenCalledWith(2027)
    expect(result.processed).toBe(1)
  })

  it('grava a execução como ok, com a hora, o total e o id devolvido', async () => {
    const result = await runJob('due_reminders')

    expect(h.db.all('jobRuns')).toEqual([
      expect.objectContaining({
        job: 'due_reminders',
        status: 'ok',
        processed: 5,
        startedAt: NOW,
        finishedAt: NOW,
      }),
    ])
    expect(h.db.read('jobRuns', result.runId)).toMatchObject({ status: 'ok' })
  })

  it('a rotina que falha fica como error, com a mensagem, e a chamada responde 500', async () => {
    h.accrueFines.mockRejectedValue(new Error('FERIADOS_API_KEY não definida'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const error = await catchError(runJob('accrue_fines'))

    expect(error.status).toBe(500)
    expect(error.code).toBe('job_failed')
    expect(h.db.all('jobRuns')).toEqual([
      expect.objectContaining({
        job: 'accrue_fines',
        status: 'error',
        processed: 0,
        error: 'FERIADOS_API_KEY não definida',
        finishedAt: NOW,
      }),
    ])
  })

  it('corta a mensagem de erro muito longa', async () => {
    h.accrueFines.mockRejectedValue(new Error('x'.repeat(2000)))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await catchError(runJob('accrue_fines'))

    expect((h.db.all('jobRuns')[0] as { error: string }).error).toHaveLength(
      500,
    )
  })

  it('cada execução ganha o seu registro', async () => {
    await runJob('expire_pickups')
    await runJob('expire_pickups')

    expect(h.db.all('jobRuns')).toHaveLength(2)
  })
})
