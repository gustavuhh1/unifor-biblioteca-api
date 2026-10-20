import { z } from 'zod'
import { USER_STATUS, USER_STATUSES } from '../../../shared/types/index.js'
import { userRoleSchema } from '../../../shared/user-role.js'

// Schemas de saída do módulo de acesso. Também alimentam o Swagger.

// As opções vêm do @simplewebauthn/server e vão direto para o celular; o
// documento mostra só as partes principais.
export const passkeyCreationOptionsSchema = z
  .looseObject({
    challenge: z.string(),
    rp: z.looseObject({ id: z.string().optional(), name: z.string() }),
    user: z.looseObject({
      id: z.string(),
      name: z.string(),
      displayName: z.string(),
    }),
    pubKeyCredParams: z.array(
      z.looseObject({ type: z.string(), alg: z.number() }),
    ),
    excludeCredentials: z.array(z.looseObject({ id: z.string() })).optional(),
    authenticatorSelection: z.looseObject({}).optional(),
  })
  .meta({ id: 'PasskeyCreationOptions' })

// Opções do login com passkey (desafio e passkeys da matrícula).
export const passkeyRequestOptionsSchema = z
  .looseObject({
    challenge: z.string(),
    rpId: z.string().optional(),
    allowCredentials: z.array(z.looseObject({ id: z.string() })).optional(),
    userVerification: z.string().optional(),
  })
  .meta({ id: 'PasskeyRequestOptions' })

// Cadastro aguardando confirmação, com o tempo até poder reenviar o token.
export const signupPendingResponseSchema = z
  .object({
    status: z.literal(USER_STATUS.pendingEmail),
    resendAvailableInSeconds: z.number().int().meta({ example: 60 }),
  })
  .meta({ id: 'SignupPendingResponse' })

// Resposta da confirmação do e-mail: as opções para criar o passkey.
export const signupConfirmResponseSchema = z
  .object({ passkeyOptions: passkeyCreationOptionsSchema })
  .meta({ id: 'SignupConfirmResponse' })

// Resposta que traz só uma mensagem.
export const messageResponseSchema = z
  .object({ message: z.string() })
  .meta({ id: 'MessageResponse' })

// Um passkey na tela Meus passkeys.
export const passkeySummarySchema = z
  .object({
    id: z.string().meta({ description: 'credentialId em base64url' }),
    deviceName: z.string(),
    createdAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'PasskeySummary' })

// Lista de passkeys do aluno.
export const passkeyListResponseSchema = z
  .object({ passkeys: z.array(passkeySummarySchema) })
  .meta({ id: 'PasskeyListResponse' })

// Custom token do Firebase devolvido pelo login com passkey.
export const customTokenResponseSchema = z
  .object({
    customToken: z.string().meta({
      description: 'Custom token do Firebase; o app o troca pela sessão.',
    }),
  })
  .meta({ id: 'CustomTokenResponse' })

// Dados de quem está logado (GET /me).
export const meResponseSchema = z
  .object({
    uid: z.string(),
    role: userRoleSchema,
    status: z.enum(USER_STATUSES),
    matricula: z.string(),
    email: z.string(),
    fullName: z.string().nullable().meta({
      description: 'Sem nome, as telas mostram a matrícula.',
    }),
    initials: z.string().nullable(),
    course: z.string().nullable(),
    entryYear: z.number().int().nullable(),
    deskLabel: z.string().nullable(),
    activeLoanCount: z.number().int(),
    activeQueueCount: z.number().int(),
    openFineTotalCents: z.number().int(),
    booksReadByYear: z.record(z.string(), z.number().int()),
    notificationPrefs: z.record(z.string(), z.boolean()),
    onboardingSeenAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Me' })
