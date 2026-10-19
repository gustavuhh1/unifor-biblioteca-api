// Lê uma propriedade de um erro desconhecido (por exemplo `code` ou `type`).
// Devolve undefined se o erro não for um objeto ou não tiver a propriedade.
export function errorProperty(error: unknown, name: string): unknown {
  return typeof error === 'object' && error !== null && name in error
    ? (error as Record<string, unknown>)[name]
    : undefined
}

// O `code` do erro como texto (ex.: "auth/user-not-found"), se ele tiver um.
export function errorCodeOf(error: unknown): string | undefined {
  const code = errorProperty(error, 'code')
  return code === undefined ? undefined : String(code)
}
