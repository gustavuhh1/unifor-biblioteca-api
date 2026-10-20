import { COSEALG } from '@simplewebauthn/server/helpers'
import type { FieldError } from '../../shared/errors.js'
import { constantsOf } from '../../shared/constants-of.js'
import type { TokenSettings } from './auth.types.js'

// Resultados possíveis ao conferir um código digitado com o token guardado.
export const TOKEN_CHECK_RESULTS = [
  'valid',
  'expired_or_used',
  'locked',
  'wrong_code',
] as const

// Os mesmos resultados com nome: TOKEN_CHECK_RESULT.valid, .expiredOrUsed etc.
export const TOKEN_CHECK_RESULT = constantsOf(TOKEN_CHECK_RESULTS)

// Valores de settings/library (emailTokenMinutes e emailTokenMaxAttempts), usados
// quando esse documento não existe.
export const DEFAULT_TOKEN_SETTINGS: TokenSettings = {
  ttlMinutes: 20,
  maxAttempts: 5,
}

// Espera mínima entre dois envios de token ("Reenviar em", tela A58).
export const RESEND_COOLDOWN_SECONDS = 60

// Nome do app mostrado pelo celular ao criar o passkey.
export const RP_NAME = 'Unifor Biblioteca'

// Quanto tempo vale um desafio do passkey (seção 2.5).
export const CHALLENGE_TTL_MINUTES = 5

// Algoritmos aceitos no passkey. Fixos, em vez do padrão da biblioteca, que
// também oferece o ML-DSA (experimental) quando o Node o suporta.
export const SUPPORTED_ALGORITHMS = [
  COSEALG.ES256,
  COSEALG.RS256,
  COSEALG.EdDSA,
]

// Resposta única da recuperação de senha: não revela se a conta existe.
export const RECOVERY_MESSAGE =
  'Se a matrícula estiver cadastrada, enviamos um token para o e-mail da conta.'

// Campos repetidos no cadastro, para o app marcar na tela (RF-AUT-01).
export const MATRICULA_TAKEN: FieldError = {
  field: 'matricula',
  message: 'Esta matrícula já tem cadastro.',
}

// Mesmo caso, para o e-mail.
export const EMAIL_TAKEN: FieldError = {
  field: 'email',
  message: 'Este e-mail já tem cadastro.',
}
