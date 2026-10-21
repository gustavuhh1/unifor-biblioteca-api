// Fuso em que as regras de negócio (prazos, dias úteis, multas) são calculadas
// (UTC-3, sem horário de verão). Os timestamps são gravados em UTC.
export const LIBRARY_TIMEZONE = 'America/Fortaleza'

// O "agora" das regras de negócio (atraso, prazos). Fica numa função só para o
// RF-SIS-04 (data simulada de teste) trocar o relógio num lugar único, sem mudar
// quem a chama. Datas de auditoria (createdAt, updatedAt, lastSyncedAt) usam o
// horário real, não esta função.
export function now(): Date {
  return new Date()
}

// Diz se o empréstimo está atrasado (RF-SIS-03): o vencimento já passou. Atraso
// nunca é gravado, é calculado com esta função.
export function isOverdue(dueAt: Date, at: Date): boolean {
  return dueAt.getTime() < at.getTime()
}
