import { z } from 'zod'

// --- Fields ---------------------------------------------------------------

// RF-AUT-02: only the format is checked, the API never asks Unifor.
export const INSTITUTIONAL_EMAIL = /^[^\s@]+@edu\.unifor\.br$/i

// Seven digits; the first two are the entry year.
export const MATRICULA = /^\d{7}$/

// Unifor passwords are digits only, at least 8 (decided on 19/10). The upper
// bound only limits the input.
export const PASSWORD = /^\d{8,128}$/

export const TOKEN_CODE = /^\d{6}$/

export const matriculaSchema = z
  .string('Informe a matrícula.')
  .trim()
  .regex(MATRICULA, 'A matrícula deve ter exatamente 7 dígitos.')
  .meta({ example: '2412858' })

export const institutionalEmailSchema = z
  .string('Informe o e-mail.')
  .trim()
  .regex(
    INSTITUTIONAL_EMAIL,
    'Use o e-mail institucional, que termina em @edu.unifor.br.',
  )
  .transform((email) => email.toLowerCase())
  .meta({ example: 'lucas@edu.unifor.br' })

export const passwordSchema = z
  .string('Informe a senha.')
  .regex(PASSWORD, 'A senha deve ter somente números, com no mínimo 8 dígitos.')
  .meta({ example: '12345678' })

export const tokenCodeSchema = z
  .string('Informe o token.')
  .trim()
  .regex(TOKEN_CODE, 'O token tem 6 dígitos.')
  .meta({ example: '482913' })

// Used by every form that sets a password: the two fields must match.
function passwordsMatch(value: {
  password: string
  passwordConfirmation: string
}) {
  return value.password === value.passwordConfirmation
}

const passwordsDoNotMatch = {
  path: ['passwordConfirmation'],
  error: 'As senhas não conferem.',
}

// A full name needs a first name and a surname.
export const fullNameSchema = z
  .string('Informe o nome completo.')
  .transform((name) => name.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(3, 'O nome deve ter de 3 a 100 caracteres.')
      .max(100, 'O nome deve ter de 3 a 100 caracteres.')
      .refine((name) => name.includes(' '), 'Informe nome e sobrenome.'),
  )
  .meta({ example: 'Lucas Almeida' })

// --- Request bodies -------------------------------------------------------

export const signupStartBodySchema = z
  .object({
    email: institutionalEmailSchema,
    matricula: matriculaSchema,
    password: passwordSchema,
    passwordConfirmation: z.string('Confirme a senha.'),
  })
  .refine(passwordsMatch, passwordsDoNotMatch)
  .meta({ id: 'SignupStartBody' })

export const signupConfirmBodySchema = z
  .object({ matricula: matriculaSchema, token: tokenCodeSchema })
  .meta({ id: 'SignupConfirmBody' })

export const matriculaBodySchema = z
  .object({ matricula: matriculaSchema })
  .meta({ id: 'MatriculaBody' })

export const passwordResetBodySchema = z
  .object({
    matricula: matriculaSchema,
    token: tokenCodeSchema,
    password: passwordSchema,
    passwordConfirmation: z.string('Confirme a senha.'),
  })
  .refine(passwordsMatch, passwordsDoNotMatch)
  .meta({ id: 'PasswordResetBody' })

// The JSON the phone produces (WebAuthn). Only what the API reads is required;
// @simplewebauthn/server checks the rest.
const clientExtensionResults = z.record(z.string(), z.unknown()).default({})

export const registrationResponseSchema = z
  .looseObject({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    clientExtensionResults,
    response: z.looseObject({
      clientDataJSON: z.string().min(1),
      attestationObject: z.string().min(1),
    }),
  })
  .meta({ id: 'RegistrationResponse' })

export const authenticationResponseSchema = z
  .looseObject({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    clientExtensionResults,
    response: z.looseObject({
      clientDataJSON: z.string().min(1),
      authenticatorData: z.string().min(1),
      signature: z.string().min(1),
    }),
  })
  .meta({ id: 'AuthenticationResponse' })

export const passkeyRegisterBodySchema = z
  .object({
    response: registrationResponseSchema,
    deviceName: z
      .string('Informe o nome do aparelho.')
      .trim()
      .min(1, 'Informe o nome do aparelho.')
      .max(60, 'O nome do aparelho deve ter até 60 caracteres.')
      .meta({ example: 'Galaxy A54' }),
  })
  .meta({ id: 'PasskeyRegisterBody' })

export const passkeyLoginVerifyBodySchema = z
  .object({ response: authenticationResponseSchema })
  .meta({ id: 'PasskeyLoginVerifyBody' })

export const passkeyParamsSchema = z.object({
  id: z.string().min(1).max(1024),
})

export const updateMeBodySchema = z
  .object({ fullName: fullNameSchema })
  .meta({ id: 'UpdateMeBody' })

// --- Responses (also used by the Swagger document) -------------------------

// The options object comes from @simplewebauthn/server and goes straight to
// the phone; the document only shows its main parts.
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

export const passkeyRequestOptionsSchema = z
  .looseObject({
    challenge: z.string(),
    rpId: z.string().optional(),
    allowCredentials: z.array(z.looseObject({ id: z.string() })).optional(),
    userVerification: z.string().optional(),
  })
  .meta({ id: 'PasskeyRequestOptions' })

export const signupPendingResponseSchema = z
  .object({
    status: z.literal('pending_email'),
    resendAvailableInSeconds: z.number().int().meta({ example: 60 }),
  })
  .meta({ id: 'SignupPendingResponse' })

export const signupConfirmResponseSchema = z
  .object({ passkeyOptions: passkeyCreationOptionsSchema })
  .meta({ id: 'SignupConfirmResponse' })

export const messageResponseSchema = z
  .object({ message: z.string() })
  .meta({ id: 'MessageResponse' })

export const passkeySummarySchema = z
  .object({
    id: z.string().meta({ description: 'credentialId em base64url' }),
    deviceName: z.string(),
    createdAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'PasskeySummary' })

export const passkeyListResponseSchema = z
  .object({ passkeys: z.array(passkeySummarySchema) })
  .meta({ id: 'PasskeyListResponse' })

export const customTokenResponseSchema = z
  .object({
    customToken: z.string().meta({
      description: 'Custom token do Firebase; o app o troca pela sessão.',
    }),
  })
  .meta({ id: 'CustomTokenResponse' })

export const meResponseSchema = z
  .object({
    uid: z.string(),
    role: z.enum(['student', 'librarian']),
    status: z.enum(['pending_email', 'active', 'disabled']),
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

export type SignupStartBody = z.infer<typeof signupStartBodySchema>
export type SignupConfirmBody = z.infer<typeof signupConfirmBodySchema>
export type PasswordResetBody = z.infer<typeof passwordResetBodySchema>
export type PasskeyRegisterBody = z.infer<typeof passkeyRegisterBodySchema>
export type PasskeyLoginVerifyBody = z.infer<
  typeof passkeyLoginVerifyBodySchema
>
export type MeResponse = z.infer<typeof meResponseSchema>
