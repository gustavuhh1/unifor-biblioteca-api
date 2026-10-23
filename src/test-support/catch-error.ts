import type { AppError } from '../shared/errors.js'

// Espera a promessa falhar e devolve o erro (ou undefined se ela deu certo).
export async function catchError(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.then(
    () => undefined,
    (error: unknown) => error,
  )) as AppError
}
