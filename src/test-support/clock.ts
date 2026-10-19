// Instante fixo usado pelos testes do módulo de acesso (19/10/2026, 12:00 UTC).
export const START = new Date('2026-10-19T12:00:00Z')

// O instante que fica `seconds` segundos depois de START.
export const after = (seconds: number) =>
  new Date(START.getTime() + seconds * 1000)
