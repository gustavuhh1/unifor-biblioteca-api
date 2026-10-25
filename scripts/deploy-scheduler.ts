// Cria (ou atualiza) os jobs do Cloud Scheduler que chamam as rotinas da API
// (RF-SIS-05), e a conta de serviço deles.
//   npm run deploy:scheduler
// Pode rodar de novo: o que já existe é atualizado, nada é duplicado. Não mexe no
// Firestore nem no Cloud Run. Precisa do Cloud Scheduler ativado no projeto e da
// API já publicada com a rota /jobs (npm run deploy).
import { env } from '../src/config/env.js'
import { JOB_NAMES } from '../src/shared/types/index.js'
import { confirmProduction } from './lib/environment.js'
import { commandSucceeds, runCommand } from './lib/run-command.js'
import {
  JOB_SCHEDULES,
  createServiceAccountArgs,
  describeJobArgs,
  describeServiceAccountArgs,
  jobNameOf,
  upsertJobArgs,
} from './scheduler/plan.js'

async function main(): Promise<number> {
  const project = env.GOOGLE_CLOUD_PROJECT
  const confirmed = await confirmProduction(
    project,
    `cria a conta de serviço e ${JOB_NAMES.length} jobs no Cloud Scheduler`,
  )
  if (!confirmed) {
    console.log('Cancelado.')
    return 1
  }

  console.log('\n1. Conta de serviço do Cloud Scheduler')
  if (commandSucceeds('gcloud', describeServiceAccountArgs(project))) {
    console.log('  já existe')
  } else if (!runCommand('gcloud', createServiceAccountArgs(project))) {
    return 1
  }

  console.log('\n2. Jobs')
  for (const job of JOB_NAMES) {
    const exists = commandSucceeds('gcloud', describeJobArgs(project, job))
    const action = exists ? 'update' : 'create'
    console.log(
      `  ${jobNameOf(job)} (${JOB_SCHEDULES[job].cron}): ${exists ? 'atualizando' : 'criando'}`,
    )
    if (!runCommand('gcloud', upsertJobArgs(action, project, job))) return 1
  }

  console.log(
    '\nPronto. Para rodar uma rotina agora: gcloud scheduler jobs run <nome> --location=southamerica-east1',
  )
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
