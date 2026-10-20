import type { z } from 'zod'
import type {
  EmailToken,
  Passkey,
  UserRole,
  UserStatus,
} from '../../shared/types/index.js'
import type { TOKEN_CHECK_RESULT } from './auth.constants.js'
import type {
  passkeyLoginVerifyBodySchema,
  passkeyRegisterBodySchema,
  passwordResetBodySchema,
  signupConfirmBodySchema,
  signupStartBodySchema,
} from './schemas/request.schemas.js'
import type {
  meResponseSchema,
  passkeySummarySchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo de acesso. Os documentos das coleções e os enums
// ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

// Corpo de POST /auth/signup/start.
export type SignupStartBody = z.infer<typeof signupStartBodySchema>
// Corpo de POST /auth/signup/confirm.
export type SignupConfirmBody = z.infer<typeof signupConfirmBodySchema>
// Corpo de POST /auth/password/reset.
export type PasswordResetBody = z.infer<typeof passwordResetBodySchema>
// Corpo de POST /auth/passkey/register.
export type PasskeyRegisterBody = z.infer<typeof passkeyRegisterBodySchema>
// Corpo de POST /auth/passkey/login/verify.
export type PasskeyLoginVerifyBody = z.infer<
  typeof passkeyLoginVerifyBodySchema
>
// Resposta de GET /me e PATCH /me.
export type MeResponse = z.infer<typeof meResponseSchema>
// Um passkey na tela Meus passkeys (nunca traz a chave).
export type PasskeySummary = z.infer<typeof passkeySummarySchema>

// --- Token de e-mail ---------------------------------------------------------

// Validade e limite de tentativas (settings/library).
export interface TokenSettings {
  ttlMinutes: number
  maxAttempts: number
}

// O código de 6 dígitos (que só sai para o e-mail) e o que vai para o banco.
export interface TokenSecret {
  code: string
  salt: string
  codeHash: string
}

// O que a regra precisa saber de um token guardado.
export type StoredToken = Pick<
  EmailToken,
  'codeHash' | 'salt' | 'expiresAt' | 'attempts'
> & {
  usedAt?: Date | null
  invalidatedAt?: Date | null
}

// O que um código digitado significa para um token guardado.
export type TokenCheck =
  | { result: (typeof TOKEN_CHECK_RESULT)['valid'] }
  // Já usado, trocado por um token mais novo, ou vencido.
  | { result: (typeof TOKEN_CHECK_RESULT)['expiredOrUsed'] }
  | { result: (typeof TOKEN_CHECK_RESULT)['locked'] }
  // attemptsLeft já desconta o palpite errado que acabou de ser feito.
  | { result: (typeof TOKEN_CHECK_RESULT)['wrongCode']; attemptsLeft: number }

// Qualquer resultado diferente de valid.
export type FailedTokenCheck = Exclude<
  TokenCheck,
  { result: (typeof TOKEN_CHECK_RESULT)['valid'] }
>

// Documento de emailTokens com o seu id.
export type EmailTokenRecord = EmailToken & { id: string }

// --- Contas ------------------------------------------------------------------

// Resumo de uma conta achada pela matrícula.
export interface UserAccount {
  uid: string
  role: UserRole
  status: UserStatus
  // E-mail real da conta.
  email: string
}

// Aluno que se cadastrou e ainda não confirmou o e-mail.
export type PendingStudent = Pick<UserAccount, 'uid' | 'email'>

// Quem já ocupa a matrícula e o e-mail de um cadastro.
export interface IndexOwners {
  matriculaOwnerUid?: string
  emailOwnerUid?: string
}

// --- Passkey -----------------------------------------------------------------

// Documento de passkeys com o seu id (o credentialId).
export type PasskeyRecord = Passkey & { id: string }

// Passkey como o @simplewebauthn/server o descreve nas opções.
export interface CredentialRef {
  id: string
  transports?: string[] | undefined
}

// RP ID e origens aceitas na verificação.
export interface PasskeyConfig {
  rpId: string
  origins: string[]
}

// --- E-mail ------------------------------------------------------------------

// Como o token chega ao aluno.
export type MailMode = 'resend' | 'console' | 'unavailable'
