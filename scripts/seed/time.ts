import { atLocalTime, weekdayOf } from '../../src/shared/calendar/dates.js'
import type { WeekdayKey } from '../../src/shared/calendar/dates.js'
import { DEFAULT_OPENING_HOURS } from '../../src/shared/library.js'

// Auxiliares de data usadas só pelo seed. As funções de data e de dia útil da API
// (atLocalTime, localDate, plusDays, daysBetween, lateBusinessDays...) estão em
// src/shared/calendar.

const WEEKDAY_NAMES: Record<WeekdayKey, string> = {
  sun: 'dom',
  mon: 'seg',
  tue: 'ter',
  wed: 'qua',
  thu: 'qui',
  fri: 'sex',
  sat: 'sáb',
}

// "seg, 19/10": como o app escreve um prazo.
export function formatDayMonth(date: string): string {
  return `${WEEKDAY_NAMES[weekdayOf(date)]}, ${date.slice(8, 10)}/${date.slice(5, 7)}`
}

// Horário de fechamento da biblioteca naquele dia: onde caem prazos e
// vencimentos. Domingo é fechado; como as datas agora seguem o dia em que o seed
// roda, uma data que cai num domingo usa só o fechamento de dia de semana (sem
// refinamento).
export function closingTime(date: string): string {
  return (DEFAULT_OPENING_HOURS[weekdayOf(date)] ?? DEFAULT_OPENING_HOURS.mon!)
    .close
}

// Instante do fechamento da biblioteca no dia informado.
export function atClosing(date: string): Date {
  return atLocalTime(date, closingTime(date))
}
