import { envSchema } from '../../src/config/env.js'

// Onde a API roda (docs/infra.md). A região e o nome não mudam entre deploys;
// o projeto vem de GOOGLE_CLOUD_PROJECT.
export const REGION = 'southamerica-east1'
export const SERVICE = 'unibooks-api'
// Repositório do Artifact Registry que guarda as imagens (a política de limpeza
// dele fica em deploy/artifact-cleanup-policy.json).
export const REPOSITORY = 'unibooks'

// Variável do Cloud Run → nome do segredo no Secret Manager. Sempre a versão
// mais recente: ao trocar uma chave, o próximo deploy já usa a nova.
export const SECRETS = {
  RESEND_API_KEY: 'resend-api-key',
  FERIADOS_API_KEY: 'feriados-api-key',
  GEMINI_API_KEY: 'gemini-api-key',
} as const

// O que o deploy leva ao Cloud Run, quando o .env está em ordem.
export interface DeployConfig {
  project: string
  // Só variáveis NÃO secretas. Os segredos vêm do Secret Manager.
  envVars: Record<string, string>
}

// Resultado da conferência do .env: a configuração do deploy ou os problemas
// que o impedem (nunca os dois).
export type DeployPlan =
  | { config: DeployConfig; problems: [] }
  | { config?: undefined; problems: string[] }

// Confere as variáveis do .env como se fossem as de produção e monta as que
// vão ao Cloud Run. As variáveis dos emuladores nunca entram: o Cloud Run tem
// de falar com o Firestore e o Firebase Auth de verdade.
export function planDeployEnv(source: NodeJS.ProcessEnv): DeployPlan {
  const parsed = envSchema.safeParse({ ...source, NODE_ENV: 'production' })
  if (!parsed.success) {
    return {
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    }
  }

  const {
    GOOGLE_CLOUD_PROJECT,
    PASSKEY_RP_ID,
    PASSKEY_ANDROID_ORIGINS,
    AUTH_EMAIL_DOMAIN,
    EMAIL_FROM,
    GEMINI_MODEL,
    SCHEDULER_AUDIENCE,
    SCHEDULER_SERVICE_ACCOUNT,
  } = parsed.data

  const problems: string[] = []
  if (PASSKEY_ANDROID_ORIGINS.length === 0) {
    problems.push(
      'PASSKEY_ANDROID_ORIGINS não está definida no .env: sem ela o passkey do app Android não funciona.',
    )
  }
  if (!EMAIL_FROM) problems.push('EMAIL_FROM não está definida no .env.')
  if (!GEMINI_MODEL) problems.push('GEMINI_MODEL não está definida no .env.')
  // PASSKEY_RP_ID e AUTH_EMAIL_DOMAIN já foram exigidas pelo envSchema; as
  // últimas condições só estreitam o tipo.
  if (
    problems.length > 0 ||
    !PASSKEY_RP_ID ||
    !AUTH_EMAIL_DOMAIN ||
    !EMAIL_FROM ||
    !GEMINI_MODEL
  ) {
    return { problems }
  }

  return {
    problems: [],
    config: {
      project: GOOGLE_CLOUD_PROJECT,
      envVars: {
        NODE_ENV: 'production',
        GOOGLE_CLOUD_PROJECT,
        PASSKEY_RP_ID,
        PASSKEY_ANDROID_ORIGINS: PASSKEY_ANDROID_ORIGINS.join(','),
        AUTH_EMAIL_DOMAIN,
        EMAIL_FROM,
        GEMINI_MODEL,
        SCHEDULER_AUDIENCE: SCHEDULER_AUDIENCE ?? 'https://api.uni-books.app',
        SCHEDULER_SERVICE_ACCOUNT:
          SCHEDULER_SERVICE_ACCOUNT ??
          `unibooks-scheduler@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com`,
      },
    },
  }
}

// Endereço da imagem no Artifact Registry. `tag` é o commit que está sendo
// publicado.
export function imageName(project: string, tag: string): string {
  return `${REGION}-docker.pkg.dev/${project}/${REPOSITORY}/api:${tag}`
}

// O arquivo de variáveis do `gcloud run deploy`: um YAML simples, com cada
// valor entre aspas (JSON é YAML válido). Vai num arquivo, e não na linha de
// comando, porque PASSKEY_ANDROID_ORIGINS pode ter vírgulas e dois-pontos.
export function envVarsYaml(envVars: Record<string, string>): string {
  return (
    Object.entries(envVars)
      .map(([name, value]) => `${name}: ${JSON.stringify(value)}`)
      .join('\n') + '\n'
  )
}

// `gcloud builds submit`: o Cloud Build monta a imagem com o Dockerfile e a
// manda ao Artifact Registry.
export function buildArgs(project: string, image: string): string[] {
  return ['builds', 'submit', '--project', project, '--tag', image, '.']
}

// `gcloud run deploy`. --env-vars-file e --set-secrets substituem tudo o que o
// serviço tinha, então o que está no Cloud Run sempre é igual ao deste plano.
// Acesso público de propósito: quem protege as rotas é o ID token, na própria
// API. O timeout de 60 s é o limite do Firebase Hosting na frente do serviço.
export function deployArgs(
  project: string,
  image: string,
  envFile: string,
): string[] {
  return [
    'run',
    'deploy',
    SERVICE,
    '--project',
    project,
    '--region',
    REGION,
    '--image',
    image,
    '--service-account',
    `${SERVICE}@${project}.iam.gserviceaccount.com`,
    '--min-instances',
    '0',
    '--max-instances',
    '2',
    '--timeout',
    '60',
    '--allow-unauthenticated',
    '--env-vars-file',
    envFile,
    '--set-secrets',
    Object.entries(SECRETS)
      .map(([variable, secret]) => `${variable}=${secret}:latest`)
      .join(','),
    '--quiet',
  ]
}
