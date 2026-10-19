import { TZDate } from '@date-fns/tz'
import { addDays, format, getDay } from 'date-fns'
import { LIBRARY_TIMEZONE } from '../../src/shared/time.js'

// Library hours (docs/modelo-de-dados-firestore.md, section 2.21).
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

// A wall-clock time in America/Fortaleza ("AAAA-MM-DD", "HH:mm") as an instant.
export function at(date: string, time: string): Date {
  const [year, month, day] = parts(date)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(
    new TZDate(year, month, day, hours!, minutes!, 0, 0, LIBRARY_TIMEZONE),
  )
}

// "AAAA-MM-DD" of an instant, as seen in America/Fortaleza.
export function localDate(instant: Date): string {
  return format(new TZDate(instant, LIBRARY_TIMEZONE), 'yyyy-MM-dd')
}

export function plusDays(date: string, days: number): string {
  const [year, month, day] = parts(date)
  return format(
    addDays(new TZDate(year, month, day, LIBRARY_TIMEZONE), days),
    'yyyy-MM-dd',
  )
}

// Closing time of the library on that day: where deadlines and due dates land.
export function closingTime(date: string): string {
  const [year, month, day] = parts(date)
  const key =
    WEEKDAY_KEYS[getDay(new TZDate(year, month, day, LIBRARY_TIMEZONE))]!
  const hours = OPENING_HOURS[key]
  if (!hours) throw new Error(`The library is closed on ${date}.`)
  return hours.close
}

// Instant at the closing time of the given day.
export function atClosing(date: string): Date {
  return at(date, closingTime(date))
}
