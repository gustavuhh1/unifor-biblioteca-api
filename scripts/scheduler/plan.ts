import { schedulerEmail } from '../../src/modules/jobs/rules/scheduler.rules.js'
import { SCHEDULER_SERVICE_ACCOUNT_NAME } from '../../src/modules/jobs/jobs.constants.js'
import { PRODUCTION_API_URL } from '../../src/shared/api-url.js'
import { REGION } from '../deploy/plan.js'
import { LIBRARY_TIMEZONE } from '../../src/shared/time.js'
import { JOB_NAME, type JobName } from '../../src/shared/types/index.js'

// Plano dos jobs do Cloud Scheduler (RF-SIS-05): quando cada rotina roda e os
// comandos do gcloud que os criam ou atualizam. Só monta texto, sem executar nada,
// para ser testado; quem executa é deploy-scheduler.ts.

// Quando cada rotina roda (cron no fuso America/Fortaleza) e o que ela faz.
export const JOB_SCHEDULES: Record<
  JobName,
  { cron: string; description: string }
> = {
  [JOB_NAME.advanceQueues]: {
    cron: '*/5 * * * *',
    description:
      'Tira da fila quem perdeu o prazo de confirmar a vez (RF-FIL-07)',
  },
  [JOB_NAME.expirePickups]: {
    cron: '*/15 * * * *',
    description: 'Expira os pedidos não retirados no prazo (RF-EMP-06)',
  },
  [JOB_NAME.dueReminders]: {
    cron: '0 8 * * *',
    description:
      'Lembretes de prazo, atraso e último dia de retirada (RF-SIS-05)',
  },
  [JOB_NAME.accrueFines]: {
    cron: '0 6 * * *',
    description:
      'Começa a contar a multa dos empréstimos atrasados (RF-MUL-01)',
  },
  [JOB_NAME.refreshHolidays]: {
    cron: '0 3 * * 1',
    description: 'Busca os feriados do ano que faltarem (RF-SIS-01)',
  },
}

// Nome do job no Cloud Scheduler: "unibooks-expire-pickups".
export function jobNameOf(job: JobName): string {
  return `unibooks-${job.replaceAll('_', '-')}`
}

// Só o início do comando `gcloud scheduler jobs <ação> http <nome>`.
const jobsCommand = (action: string, job: JobName) => [
  'scheduler',
  'jobs',
  action,
  ...(action === 'describe' ? [] : ['http']),
  jobNameOf(job),
]

// A conta de serviço já existe? (`describe` termina bem só se existir.)
export function describeServiceAccountArgs(project: string): string[] {
  return [
    'iam',
    'service-accounts',
    'describe',
    schedulerEmail(project),
    `--project=${project}`,
  ]
}

// Cria a conta de serviço com que o Cloud Scheduler chama a API. Ela não precisa de
// nenhum papel: a API é pública e confere o token por conta própria.
export function createServiceAccountArgs(project: string): string[] {
  return [
    'iam',
    'service-accounts',
    'create',
    SCHEDULER_SERVICE_ACCOUNT_NAME,
    '--display-name=Unifor Biblioteca - Cloud Scheduler',
    `--project=${project}`,
  ]
}

// O job já existe?
export function describeJobArgs(project: string, job: JobName): string[] {
  return [
    ...jobsCommand('describe', job),
    `--location=${REGION}`,
    `--project=${project}`,
  ]
}

// Cria (`create`) ou atualiza (`update`) o job: POST em /jobs/<rotina> com o token
// OIDC da conta de serviço, para a audiência da API. Uma nova tentativa em caso de
// erro; o limite de 60 s é o do Firebase Hosting na frente da API.
export function upsertJobArgs(
  action: 'create' | 'update',
  project: string,
  job: JobName,
): string[] {
  const { cron, description } = JOB_SCHEDULES[job]
  return [
    ...jobsCommand(action, job),
    `--location=${REGION}`,
    `--project=${project}`,
    `--schedule=${cron}`,
    `--time-zone=${LIBRARY_TIMEZONE}`,
    `--uri=${PRODUCTION_API_URL}/jobs/${job}`,
    '--http-method=POST',
    `--oidc-service-account-email=${schedulerEmail(project)}`,
    `--oidc-token-audience=${PRODUCTION_API_URL}`,
    '--attempt-deadline=60s',
    '--max-retry-attempts=1',
    `--description=${description}`,
  ]
}
