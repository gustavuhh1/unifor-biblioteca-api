import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors.js'
import { buildExpectedOrigins } from './passkey-options.js'

function missingConfig(name: string): AppError {
  console.error(`${name} is not set.`)
  return new AppError(
    500,
    'config_missing',
    'O servidor está sem uma configuração necessária. Avise a equipe.',
  )
}

// E-mail of the Firebase account of a matrícula: <matricula>@<domain>. It never
// receives messages.
export function authEmailOf(matricula: string): string {
  if (!env.AUTH_EMAIL_DOMAIN) throw missingConfig('AUTH_EMAIL_DOMAIN')
  return `${matricula}@${env.AUTH_EMAIL_DOMAIN}`
}

export function getPasskeyConfig(): { rpId: string; origins: string[] } {
  if (!env.PASSKEY_RP_ID) throw missingConfig('PASSKEY_RP_ID')
  return {
    rpId: env.PASSKEY_RP_ID,
    origins: buildExpectedOrigins(
      env.PASSKEY_RP_ID,
      env.PASSKEY_ANDROID_ORIGINS,
    ),
  }
}
