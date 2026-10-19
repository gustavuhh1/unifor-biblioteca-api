import { z } from 'zod'

// Schemas de entrada do módulo de acesso: corpo, parâmetros e os campos que
// eles reutilizam. As mensagens de erro são mostradas ao usuário, em português.

// --- Campos ------------------------------------------------------------------

// RF-AUT-02: só o formato do e-mail é conferido; a API nunca consulta a Unifor.
export const INSTITUTIONAL_EMAIL = /^[^\s@]+@edu\.unifor\.br$/i

// Sete dígitos; os dois primeiros são o ano de ingresso.
export const MATRICULA = /^\d{7}$/

// A senha da Unifor é só de números, com no mínimo 8 (decidido em 19/10). O
// limite de 128 serve só para limitar a entrada.
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

// Todo formulário que define senha confere se as duas digitações são iguais.
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

// Nome completo: precisa de nome e sobrenome, de 3 a 100 caracteres.
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

// --- Corpos das requisições ----------------------------------------------------

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

// O JSON que o celular produz (WebAuthn). Só o que a API lê é obrigatório; o
// @simplewebauthn/server confere o resto.
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
