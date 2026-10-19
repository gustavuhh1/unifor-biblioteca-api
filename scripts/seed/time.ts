import { TZDate } from '@date-fns/tz'
import { addDays, differenceInCalendarDays, format, getDay } from 'date-fns'
import { LIBRARY_TIMEZONE } from '../../src/shared/time.js'

// Horário da biblioteca (docs/modelo-de-dados-firestore.md, seção 2.21).
export const OPENING_HOURS = {
  mon: { open: '07:00', close: '21:55' },
  tue: { open: '07:00', close: '21:55' },
  wed: { open: '07:00', close: '21:55' },
  thu: { open: '07:00', close: '21:55' },
  fri: { open: '07:00', close: '21:55' },
  sat: { open: '08:00', close: '14:10' },
  sun: null,
} as const

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number)
  return [year!, month! - 1, day!]
}

// Converte um horário de parede em America/Fortaleza ("AAAA-MM-DD", "HH:mm")
// num instante.
export function at(date: string, time: string): Date {
  const [year, month, day] = parts(date)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(
    new TZDate(year, month, day, hours!, minutes!, 0, 0, LIBRARY_TIMEZONE),
  )
}

// "AAAA-MM-DD" de um instante, como visto em America/Fortaleza.
export function localDate(instant: Date): string {
  return format(new TZDate(instant, LIBRARY_TIMEZONE), 'yyyy-MM-dd')
}

// Soma dias a uma data "AAAA-MM-DD".
export function plusDays(date: string, days: number): string {
  const [year, month, day] = parts(date)
  return format(
    addDays(new TZDate(year, month, day, LIBRARY_TIMEZONE), days),
    'yyyy-MM-dd',
  )
}

// Dias corridos de um dia até outro (negativo se `to` for anterior).
export function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = parts(from)
  const [toYear, toMonth, toDay] = parts(to)
  return differenceInCalendarDays(
    new TZDate(toYear, toMonth, toDay, LIBRARY_TIMEZONE),
    new TZDate(fromYear, fromMonth, fromDay, LIBRARY_TIMEZONE),
  )
}

const WEEKDAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

// "seg, 19/10": como o app escreve um prazo.
export function formatDayMonth(date: string): string {
  const [year, month, day] = parts(date)
  const weekday = getDay(new TZDate(year, month, day, LIBRARY_TIMEZONE))
  return `${WEEKDAY_NAMES[weekday]}, ${format(new TZDate(year, month, day, LIBRARY_TIMEZONE), 'dd/MM')}`
}

// Horário de fechamento da biblioteca naquele dia: onde caem prazos e
// vencimentos. Domingo é fechado; como as datas agora seguem o dia em que o seed
// roda, uma data que cai num domingo usa só o fechamento de dia de semana (sem
// refinamento).
export function closingTime(date: string): string {
  const [year, month, day] = parts(date)
  const key =
    WEEKDAY_KEYS[getDay(new TZDate(year, month, day, LIBRARY_TIMEZONE))]!
  return (OPENING_HOURS[key] ?? OPENING_HOURS.mon).close
}

// Instante do fechamento da biblioteca no dia informado.
export function atClosing(date: string): Date {
  return at(date, closingTime(date))
}
