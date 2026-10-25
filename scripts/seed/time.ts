import { weekdayOf } from '../../src/shared/calendar/dates.js'
import { DEFAULT_OPENING_HOURS } from '../../src/shared/library.js'

// Auxiliares de data usadas só pelo seed. As funções de data e de dia útil da API
// (atLocalTime, localDate, plusDays, daysBetween, lateBusinessDays...) estão em
// src/shared/calendar.

// Horário de fechamento da biblioteca naquele dia da semana (21h55 ou, no sábado,
// 14h10). Domingo é fechado e usa o fechamento de dia de semana; o seed nunca
// dá a um vencimento um domingo (build.ts ajusta para o próximo dia aberto).
export function closingTime(date: string): string {
  return (DEFAULT_OPENING_HOURS[weekdayOf(date)] ?? DEFAULT_OPENING_HOURS.mon!)
    .close
}
