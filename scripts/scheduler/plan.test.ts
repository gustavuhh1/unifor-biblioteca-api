import { describe, expect, it } from 'vitest'
import { JOB_NAMES } from '../../src/shared/types/index.js'
import {
  JOB_SCHEDULES,
  createServiceAccountArgs,
  describeJobArgs,
  describeServiceAccountArgs,
  jobNameOf,
  upsertJobArgs,
} from './plan.js'

const PROJECT = 'estoque-pay'

describe('jobs do Cloud Scheduler (plano, RF-SIS-05)', () => {
  it('cada rotina tem um horário e um nome de job próprios', () => {
    expect(Object.keys(JOB_SCHEDULES).sort()).toEqual([...JOB_NAMES].sort())
    const names = JOB_NAMES.map(jobNameOf)
    expect(new Set(names).size).toBe(JOB_NAMES.length)
    expect(jobNameOf('expire_pickups')).toBe('unibooks-expire-pickups')
  })

  it('os horários são os combinados: filas a cada 5 min, pedidos a cada 15, o resto uma vez', () => {
    expect(JOB_SCHEDULES.advance_queues.cron).toBe('*/5 * * * *')
    expect(JOB_SCHEDULES.expire_pickups.cron).toBe('*/15 * * * *')
    expect(JOB_SCHEDULES.due_reminders.cron).toBe('0 8 * * *')
    expect(JOB_SCHEDULES.accrue_fines.cron).toBe('0 6 * * *')
    expect(JOB_SCHEDULES.refresh_holidays.cron).toBe('0 3 * * 1')
  })

  it('o job faz POST em /jobs/<rotina> com o token OIDC da conta de serviço e a audiência da API', () => {
    const args = upsertJobArgs('create', PROJECT, 'accrue_fines')

    expect(args.slice(0, 5)).toEqual([
      'scheduler',
      'jobs',
      'create',
      'http',
      'unibooks-accrue-fines',
    ])
    expect(args).toContain('--uri=https://api.uni-books.app/jobs/accrue_fines')
    expect(args).toContain('--http-method=POST')
    expect(args).toContain(
      '--oidc-service-account-email=unibooks-scheduler@estoque-pay.iam.gserviceaccount.com',
    )
    expect(args).toContain('--oidc-token-audience=https://api.uni-books.app')
    expect(args).toContain('--time-zone=America/Fortaleza')
    expect(args).toContain('--location=southamerica-east1')
    expect(args).toContain(`--project=${PROJECT}`)
  })

  it('atualizar usa os mesmos argumentos, trocando só a ação', () => {
    const create = upsertJobArgs('create', PROJECT, 'due_reminders')
    const update = upsertJobArgs('update', PROJECT, 'due_reminders')

    expect(update[2]).toBe('update')
    expect([update[0], update[1], ...update.slice(3)]).toEqual([
      create[0],
      create[1],
      ...create.slice(3),
    ])
  })

  it('as descrições não têm acento (o gcloud no Windows troca por "?")', () => {
    for (const { description } of Object.values(JOB_SCHEDULES)) {
      expect(description).toMatch(/^[\x20-\x7e]+$/)
    }
  })

  it('nenhum comando leva chave, senha ou token', () => {
    const everything = [
      ...JOB_NAMES.flatMap((job) => upsertJobArgs('create', PROJECT, job)),
      ...createServiceAccountArgs(PROJECT),
    ].join(' ')

    expect(everything).not.toMatch(/key|secret|password|token=/i)
  })

  it('pergunta se o job e a conta de serviço existem antes de criar', () => {
    expect(describeJobArgs(PROJECT, 'expire_pickups')).toEqual([
      'scheduler',
      'jobs',
      'describe',
      'unibooks-expire-pickups',
      '--location=southamerica-east1',
      `--project=${PROJECT}`,
    ])
    expect(describeServiceAccountArgs(PROJECT)).toEqual([
      'iam',
      'service-accounts',
      'describe',
      'unibooks-scheduler@estoque-pay.iam.gserviceaccount.com',
      `--project=${PROJECT}`,
    ])
  })

  it('cria a conta de serviço com o nome combinado', () => {
    expect(createServiceAccountArgs(PROJECT)).toEqual([
      'iam',
      'service-accounts',
      'create',
      'unibooks-scheduler',
      '--display-name=Unifor Biblioteca - Cloud Scheduler',
      `--project=${PROJECT}`,
    ])
  })
})
