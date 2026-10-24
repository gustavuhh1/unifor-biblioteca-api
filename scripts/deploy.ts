// Deploy da API no Cloud Run (RNF-IMP-01).
//   npm run deploy
// Monta a imagem no Cloud Build, manda ao Artifact Registry e publica o serviço.
// Lê as variáveis não secretas do .env; os segredos vêm do Secret Manager.
// Antes, publique a configuração do Firestore com `npm run deploy:firestore`.
import { execFileSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { confirmProduction } from './lib/environment.js'
import { runCommand } from './lib/run-command.js'
import {
  REGION,
  SERVICE,
  buildArgs,
  deployArgs,
  envVarsYaml,
  imageName,
  planDeployEnv,
} from './deploy/plan.js'

// Arquivo temporário das variáveis. O .gitignore e o .dockerignore já ignoram
// ".env.*": ele não vai para o Git nem para a imagem, e é apagado no fim.
const ENV_FILE = '.env.cloudrun.yaml'

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

async function main(): Promise<number> {
  const plan = planDeployEnv(process.env)
  if (!plan.config) {
    console.error('Não dá para fazer o deploy:')
    for (const problem of plan.problems) console.error(`  - ${problem}`)
    return 1
  }
  const { project, envVars } = plan.config

  // O deploy é do que está commitado: assim a imagem sempre tem o commit como tag.
  if (git('status', '--porcelain') !== '') {
    console.error(
      'Há alterações sem commit. Faça o commit antes do deploy, para a imagem corresponder a um commit.',
    )
    return 1
  }
  const image = imageName(project, git('rev-parse', '--short', 'HEAD'))

  const confirmed = await confirmProduction(
    project,
    `publica a imagem ${image} no serviço ${SERVICE} (${REGION})`,
  )
  if (!confirmed) {
    console.log('Cancelado.')
    return 1
  }

  console.log('\n1/2 Montando a imagem no Cloud Build...')
  if (!runCommand('gcloud', buildArgs(project, image))) return 1

  console.log('\n2/2 Publicando no Cloud Run...')
  writeFileSync(ENV_FILE, envVarsYaml(envVars))
  try {
    if (!runCommand('gcloud', deployArgs(project, image, ENV_FILE))) return 1
  } finally {
    rmSync(ENV_FILE, { force: true })
  }

  console.log(`\nPronto. Confira: curl https://api.uni-books.app/health`)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
