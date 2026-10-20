import { AppError, type FieldError } from '../../shared/errors.js'
import { TOKEN_CHECK_RESULT } from './auth.constants.js'
import type { FailedTokenCheck } from './auth.types.js'

// Erros do módulo de acesso. O code é estável e em inglês; a mensagem é mostrada
// ao usuário, em português.

// 429: novo token pedido antes de 60 segundos.
export function tooSoon(waitSeconds: number): AppError {
  return new AppError(
    429,
    'token_resend_too_soon',
    `Aguarde ${waitSeconds} segundos para pedir outro token.`,
    { retryAfterSeconds: waitSeconds },
  )
}

// 409: matrícula e/ou e-mail já cadastrados (RF-AUT-01).
export function conflictError(fields: FieldError[]): AppError {
  const message =
    fields.length === 1
      ? fields[0]!.message
      : 'Esta matrícula e este e-mail já têm cadastro.'
  return new AppError(409, 'signup_conflict', message, { fields })
}

// 400: o que o app mostra para cada jeito de um token falhar (tela A77).
export function tokenError(check: FailedTokenCheck): AppError {
  switch (check.result) {
    case TOKEN_CHECK_RESULT.expiredOrUsed:
      return new AppError(
        400,
        'token_expired_or_used',
        'Token expirado ou já usado. Peça um novo token.',
      )
    case TOKEN_CHECK_RESULT.locked:
      return new AppError(
        400,
        'token_attempts_exceeded',
        'Você errou o token muitas vezes. Peça um novo token.',
      )
    case TOKEN_CHECK_RESULT.wrongCode:
      return new AppError(
        400,
        'token_invalid',
        check.attemptsLeft > 0
          ? `Token incorreto. Você ainda tem ${check.attemptsLeft} ${check.attemptsLeft === 1 ? 'tentativa' : 'tentativas'}.`
          : 'Token incorreto. Peça um novo token.',
      )
  }
}

// 400: o token não existe, venceu, foi substituído ou já foi usado (tela A77).
export function tokenExpiredOrUsed(): AppError {
  return tokenError({ result: TOKEN_CHECK_RESULT.expiredOrUsed })
}

// 500: falta uma variável de ambiente que o módulo precisa.
export function configMissing(name: string): AppError {
  console.error(`${name} não está definida.`)
  return new AppError(
    500,
    'config_missing',
    'O servidor está sem uma configuração necessária. Avise a equipe.',
  )
}

// 404: não há cadastro aguardando confirmação para a matrícula.
export function signupNotFound(): AppError {
  return new AppError(
    404,
    'signup_not_found',
    'Não há cadastro aguardando confirmação para esta matrícula.',
  )
}

// 404: perfil sem documento em users.
export function profileNotFound(): AppError {
  return new AppError(404, 'profile_not_found', 'Perfil não encontrado.')
}

// 400: o desafio do passkey não existe, venceu ou já foi usado.
export function challengeInvalid(): AppError {
  return new AppError(
    400,
    'passkey_challenge_invalid',
    'O pedido de passkey expirou. Comece de novo.',
  )
}

// 400: o celular mandou um registro que não passou na verificação.
export function registrationFailed(): AppError {
  return new AppError(
    400,
    'passkey_registration_failed',
    'Não foi possível criar o passkey. Tente de novo.',
  )
}

// 409: o aparelho já tem este passkey.
export function alreadyRegistered(): AppError {
  return new AppError(
    409,
    'passkey_already_registered',
    'Este aparelho já tem um passkey desta conta.',
  )
}

// 401: qualquer falha no login com passkey tem esta mesma resposta, para não
// dizer qual parte estava errada.
export function loginFailed(): AppError {
  return new AppError(
    401,
    'passkey_login_failed',
    'Não foi possível entrar com o passkey. Tente de novo ou use matrícula e senha.',
  )
}

// 404: passkey inexistente ou de outra conta.
export function passkeyNotFound(): AppError {
  return new AppError(404, 'passkey_not_found', 'Passkey não encontrado.')
}

// 500: o envio de e-mail não está configurado.
export function emailNotConfigured(): AppError {
  return new AppError(
    500,
    'email_not_configured',
    'O envio de e-mail não está configurado.',
  )
}

// 502: o Resend não enviou o e-mail.
export function emailDeliveryFailed(): AppError {
  return new AppError(
    502,
    'email_delivery_failed',
    'Não foi possível enviar o e-mail agora. Tente novamente em instantes.',
  )
}
