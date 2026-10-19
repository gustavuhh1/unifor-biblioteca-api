// `code` is a stable English identifier the app can rely on;
// `message` is Portuguese and shown to the user as is.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const unauthorized = () =>
  new AppError(
    401,
    'unauthorized',
    'Sua sessão expirou ou é inválida. Entre novamente.',
  )

export const forbidden = () =>
  new AppError(
    403,
    'forbidden',
    'Você não tem permissão para acessar este recurso.',
  )
