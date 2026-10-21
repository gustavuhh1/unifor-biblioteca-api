// Campo que o app pode marcar como errado. A `message` é em português.
export interface FieldError {
  field: string
  message: string
}

// Partes opcionais do corpo do erro, junto de `code` e `message`.
export interface ErrorExtra {
  fields?: FieldError[]
  retryAfterSeconds?: number
  // O que o usuário pode fazer no lugar, como código estável em inglês (ex.:
  // "mark_unavailable").
  suggestion?: string
}

// Erro da API com status HTTP. O `code` é um identificador estável, em inglês,
// em que o app pode confiar; a `message` é em português e é mostrada ao usuário
// do jeito que está.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: ErrorExtra = {},
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// 401: sem sessão, sessão expirada ou token inválido (RF-AUT-12).
export const unauthorized = () =>
  new AppError(
    401,
    'unauthorized',
    'Sua sessão expirou ou é inválida. Entre novamente.',
  )

// 403: perfil sem permissão para a rota (RF-AUT-12).
export const forbidden = () =>
  new AppError(
    403,
    'forbidden',
    'Você não tem permissão para acessar este recurso.',
  )
