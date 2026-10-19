import { TZDate } from '@date-fns/tz'
import { addDays, format, isWeekend, startOfDay } from 'date-fns'
import { LIBRARY_TIMEZONE } from '../../src/shared/time.js'
import { DATE_FORMAT } from './time.js'

// Auxiliar simples usada só pelo seed (dados e conferência final). Dias úteis de
// atraso = dias de segunda a sexta depois do vencimento, até `until` inclusive,
// que não sejam feriado nem recesso. A regra real de dia útil da API (prazos,
// sábados) é outra tarefa, em src/shared/.
export function lateBusinessDays(
  dueAt: Date,
  until: Date,
  nonWorkingDates: ReadonlySet<string>,
): number {
  const last = startOfDay(new TZDate(until, LIBRARY_TIMEZONE))
  let day = addDays(startOfDay(new TZDate(dueAt, LIBRARY_TIMEZONE)), 1)
  let count = 0
  while (day <= last) {
    if (!isWeekend(day) && !nonWorkingDates.has(format(day, DATE_FORMAT))) {
      count++
    }
    day = addDays(day, 1)
  }
  return count
}
