import { z } from 'zod'

// A blank line copied from .env.example arrives as "", which means "not set".
const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const optionalString = z.preprocess(emptyToUndefined, z.string().optional())

// Names follow docs/infra.md. Secrets and module settings are optional: the API
// must start without the key of a module that is not implemented yet.
export const envSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  // 8080 is the port Cloud Run expects.
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(65535).default(8080),
  ),

  GOOGLE_CLOUD_PROJECT: z.preprocess(
    emptyToUndefined,
    z.string().default('estoque-pay'),
  ),
  // Read by the Firebase Admin SDK itself; when set, it talks to the emulators.
  FIRESTORE_EMULATOR_HOST: optionalString,
  FIREBASE_AUTH_EMULATOR_HOST: optionalString,

  PASSKEY_RP_ID: optionalString,
  AUTH_EMAIL_DOMAIN: optionalString,

  EMAIL_FROM: optionalString,
  GEMINI_MODEL: optionalString,

  // Secrets: Secret Manager in production, local .env in development.
  RESEND_API_KEY: optionalString,
  FERIADOS_API_KEY: optionalString,
  GEMINI_API_KEY: optionalString,
  GOOGLE_BOOKS_API_KEY: optionalString,
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    )
  }
  return result.data
}

export const env = parseEnv()
