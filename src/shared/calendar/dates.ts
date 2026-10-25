import { TZDate } from '@date-fns/tz'
import { addDays, differenceInCalendarDays, format, getDay } from 'date-fns'
import { LIBRARY_TIMEZONE } from '../time.js'
import type { DateOnly, OpeningHours } from '../types/index.js'

// Datas sem hora ("AAAA-MM-DD") e horários de parede em America/Fortaleza. As
// contas de prazo (dias úteis, vencimento, atraso) usam estas funções; o que vai
// para o banco continua sendo um instante em UTC.

// Formato "AAAA-MM-DD" das datas sem hora (date-fns).
export const DATE_FORMAT = 'yyyy-MM-dd'

// Dia da semana como chave de settings.openingHours.
export type WeekdayKey = keyof OpeningHours

const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
]

function parts(date: DateOnly): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number)
  return [year!, month! - 1, day!]
}

// Converte um horário de parede em America/Fortaleza ("AAAA-MM-DD", "HH:mm")
// num instante.
export function atLocalTime(date: DateOnly, time: string): Date {
  const [year, month, day] = parts(date)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(
    new TZDate(year, month, day, hours!, minutes!, 0, 0, LIBRARY_TIMEZONE),
  )
}

// "AAAA-MM-DD" de um instante, como visto em America/Fortaleza.
export function localDate(instant: Date): DateOnly {
  return format(new TZDate(instant, LIBRARY_TIMEZONE), DATE_FORMAT)
}

// Dia e hora de um instante como o aluno lê num aviso, em America/Fortaleza:
// "16/10 às 09:12".
export function formatLocalDateTime(instant: Date): string {
  return format(new TZDate(instant, LIBRARY_TIMEZONE), "dd/MM 'às' HH:mm")
}

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
export function formatDayMonth(date: DateOnly): string {
  return `${WEEKDAY_NAMES[weekdayOf(date)]}, ${date.slice(8, 10)}/${date.slice(5, 7)}`
}

// Soma dias corridos a uma data "AAAA-MM-DD".
export function plusDays(date: DateOnly, days: number): DateOnly {
  const [year, month, day] = parts(date)
  return format(
    addDays(new TZDate(year, month, day, LIBRARY_TIMEZONE), days),
    DATE_FORMAT,
  )
}

// Dias corridos de um dia até outro (negativo se `to` for anterior).
export function daysBetween(from: DateOnly, to: DateOnly): number {
  const [fromYear, fromMonth, fromDay] = parts(from)
  const [toYear, toMonth, toDay] = parts(to)
  return differenceInCalendarDays(
    new TZDate(toYear, toMonth, toDay, LIBRARY_TIMEZONE),
    new TZDate(fromYear, fromMonth, fromDay, LIBRARY_TIMEZONE),
  )
}

// Dia da semana de uma data, como chave de openingHours ("mon", "sat"...).
export function weekdayOf(date: DateOnly): WeekdayKey {
  const [year, month, day] = parts(date)
  return WEEKDAY_KEYS[getDay(new TZDate(year, month, day, LIBRARY_TIMEZONE))]!
}
