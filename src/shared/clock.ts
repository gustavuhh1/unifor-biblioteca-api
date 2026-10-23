import { env } from '../config/env.js'
import { readLoanSettings, type LoanSettings } from './firestore/settings.js'

// Relógio único das regras de negócio (RF-SIS-04). Atraso, prazos e vencimentos
// usam o "agora" daqui; as datas de auditoria (createdAt, updatedAt, lastSyncedAt)
// continuam usando o horário real.

// O "agora" das regras: a data simulada de settings/library.simulatedNow, mas só
// fora de produção; em produção, ou sem data simulada, o instante real.
export function resolveNow(
  simulatedNow: Date | null | undefined,
  production: boolean,
  real: Date = new Date(),
): Date {
  return !production && simulatedNow ? simulatedNow : real
}

// O "agora" das regras, a partir de settings/library já lidos (evita ler o
// documento duas vezes).
export function nowOf(settings: Pick<LoanSettings, 'simulatedNow'>): Date {
  return resolveNow(settings.simulatedNow, env.NODE_ENV === 'production')
}

// O "agora" das regras de negócio. Lê settings/library para ver se há data
// simulada (só fora de produção).
export async function now(): Promise<Date> {
  return nowOf(await readLoanSettings())
}
