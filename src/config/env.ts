import { z } from 'zod'

// Uma linha em branco copiada do .env.example chega como "", que quer dizer
// "não definida".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const optionalString = z.preprocess(emptyToUndefined, z.string().optional())

// Formato da origem que o app Android informa na resposta do passkey
// (WebAuthn): android:apk-key-hash:<SHA-256 do certificado, em base64url>.
export const ANDROID_ORIGIN = /^android:apk-key-hash:[A-Za-z0-9_-]+$/

// Lista separada por vírgula; itens em branco são ignorados.
const androidOrigins = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  z
    .array(
      z.string().regex(ANDROID_ORIGIN, {
        error: 'must look like android:apk-key-hash:<base64url>',
      }),
    )
    .default([]),
)

// Sem estas duas o módulo de acesso não funciona: o passkey ficaria ligado ao
// RP ID errado (o que invalida os passkeys já criados) e as contas do Firebase
// ganhariam um e-mail interno errado.
const REQUIRED_IN_PRODUCTION = ['PASSKEY_RP_ID', 'AUTH_EMAIL_DOMAIN'] as const

// Variáveis de ambiente validadas com o Zod. Os nomes seguem docs/infra.md.
// Segredos e configurações de módulos são opcionais: a API precisa subir sem a
// chave de um módulo que ainda não foi implementado.
export const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(['development', 'test', 'production']).default('development'),
    ),
    // 8080 é a porta que o Cloud Run espera.
    PORT: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(65535).default(8080),
    ),

    GOOGLE_CLOUD_PROJECT: z.preprocess(
      emptyToUndefined,
      z.string().default('estoque-pay'),
    ),
    // Lidas pelo próprio Firebase Admin SDK; quando definidas, ele fala com os
    // emuladores.
    FIRESTORE_EMULATOR_HOST: optionalString,
    FIREBASE_AUTH_EMULATOR_HOST: optionalString,

    PASSKEY_RP_ID: optionalString,
    PASSKEY_ANDROID_ORIGINS: androidOrigins,
    AUTH_EMAIL_DOMAIN: optionalString,

    EMAIL_FROM: optionalString,
    GEMINI_MODEL: optionalString,

    // Identidade OIDC usada pelo Cloud Scheduler nas rotas /internal/jobs.
    SCHEDULER_AUDIENCE: optionalString,
    SCHEDULER_SERVICE_ACCOUNT: optionalString,

    // Segredos: Secret Manager em produção e .env local no desenvolvimento.
    RESEND_API_KEY: optionalString,
    FERIADOS_API_KEY: optionalString,
    GEMINI_API_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    for (const name of REQUIRED_IN_PRODUCTION) {
      if (!env[name]) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} is required when NODE_ENV=production.`,
        })
      }
    }
  })

// Variáveis de ambiente já validadas.
export type Env = z.infer<typeof envSchema>

// Valida as variáveis de ambiente e devolve o resultado; lança um erro claro
// se alguma estiver inválida ou faltando.
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    )
  }
  return result.data
}

// As variáveis do processo, validadas uma vez ao carregar o módulo.
export const env = parseEnv()
