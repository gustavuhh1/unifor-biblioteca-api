// Cria ou atualiza a conta e os cinco jobs do Cloud Scheduler. Pode ser rodado
// novamente com segurança quando horários ou URLs mudarem.
import { spawnSync } from 'node:child_process'
import { env } from '../src/config/env.js'
import { confirmProduction } from './lib/environment.js'
import { runCommand } from './lib/run-command.js'

const PROJECT = env.GOOGLE_CLOUD_PROJECT
const REGION = 'southamerica-east1'
const AUDIENCE = env.SCHEDULER_AUDIENCE ?? 'https://api.uni-books.app'
const SERVICE_ACCOUNT =
  env.SCHEDULER_SERVICE_ACCOUNT ??
  `unibooks-scheduler@${PROJECT}.iam.gserviceaccount.com`

const jobs = [
  {
    name: 'unibooks-expire-pickups',
    job: 'expire_pickups',
    schedule: '*/15 * * * *',
  },
  {
    name: 'unibooks-advance-queues',
    job: 'advance_queues',
    schedule: '*/15 * * * *',
  },
  {
    name: 'unibooks-due-reminders',
    job: 'due_reminders',
    schedule: '0 9 * * *',
  },
  {
    name: 'unibooks-accrue-fines',
    job: 'accrue_fines',
    schedule: '15 0 * * *',
  },
  {
    name: 'unibooks-refresh-holidays',
    job: 'refresh_holidays',
    schedule: '0 3 1 * *',
  },
] as const

function exists(args: string[]): boolean {
  return (
    spawnSync('gcloud', args, {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    }).status === 0
  )
}

function schedulerArgs(mode: 'create' | 'update', item: (typeof jobs)[number]) {
  return [
    'scheduler',
    'jobs',
    mode,
    'http',
    item.name,
    '--project',
    PROJECT,
    '--location',
    REGION,
    '--schedule',
    item.schedule,
    '--time-zone',
    'America/Fortaleza',
    '--uri',
    `${AUDIENCE}/internal/jobs/${item.job}`,
    '--http-method',
    'POST',
    '--oidc-service-account-email',
    SERVICE_ACCOUNT,
    '--oidc-token-audience',
    AUDIENCE,
    '--quiet',
  ]
}

async function main(): Promise<number> {
  const confirmed = await confirmProduction(
    PROJECT,
    `cria/atualiza os jobs do Cloud Scheduler em ${REGION}`,
  )
  if (!confirmed) return 1

  if (
    !exists([
      'iam',
      'service-accounts',
      'describe',
      SERVICE_ACCOUNT,
      '--project',
      PROJECT,
    ]) &&
    !runCommand('gcloud', [
      'iam',
      'service-accounts',
      'create',
      'unibooks-scheduler',
      '--project',
      PROJECT,
      '--display-name',
      'Unibooks Cloud Scheduler',
    ])
  ) {
    return 1
  }

  for (const item of jobs) {
    const present = exists([
      'scheduler',
      'jobs',
      'describe',
      item.name,
      '--project',
      PROJECT,
      '--location',
      REGION,
    ])
    if (
      !runCommand('gcloud', schedulerArgs(present ? 'update' : 'create', item))
    ) {
      return 1
    }
  }
  console.log('\nCloud Scheduler configurado com autenticação OIDC.')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
