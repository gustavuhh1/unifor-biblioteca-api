// Constantes do módulo das rotinas agendadas (RF-SIS-05).

// Nome da conta de serviço com que o Cloud Scheduler chama a API. O e-mail completo
// é <nome>@<projeto>.iam.gserviceaccount.com.
export const SCHEDULER_SERVICE_ACCOUNT_NAME = 'unibooks-scheduler'

// Onde o Google publica as chaves públicas que assinam os tokens OIDC.
export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'

// Quem pode ser o emissor (`iss`) de um token do Google.
export const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
] as const

// Quanto tempo as chaves do Google ficam guardadas, em milissegundos.
export const GOOGLE_CERTS_TTL_MS = 60 * 60 * 1000

// Folga, em segundos, para a diferença entre o relógio do Google e o da API.
export const TOKEN_CLOCK_TOLERANCE_SECONDS = 60

// Tempo máximo da busca das chaves do Google, em milissegundos.
export const GOOGLE_CERTS_TIMEOUT_MS = 5000

// Tamanho máximo da mensagem de erro gravada em jobRuns.
export const JOB_ERROR_MAX_LENGTH = 500
