// Fuso em que as regras de negócio (prazos, dias úteis, multas) são calculadas
// (UTC-3, sem horário de verão). Os timestamps são gravados em UTC.
export const LIBRARY_TIMEZONE = 'America/Fortaleza'

// Diz se o empréstimo está atrasado (RF-SIS-03): o vencimento já passou. Atraso
// nunca é gravado, é calculado com esta função. O "agora" vem de shared/clock.ts.
export function isOverdue(dueAt: Date, at: Date): boolean {
  return dueAt.getTime() < at.getTime()
}
