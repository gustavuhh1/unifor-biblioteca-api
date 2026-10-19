import { TZDate } from '@date-fns/tz'
import { addDays, format, isWeekend, startOfDay } from 'date-fns'
import { LIBRARY_TIMEZONE } from '../../src/shared/time.js'

// Simple helper used only by the seed (data and the final check). Business
// days of delay = Monday-to-Friday days after the due date, up to and including
// `until`, that are not holidays or recesses. The real business-day rule of the
// API (deadlines, Saturdays) is a separate task in src/shared/.
export function lateBusinessDays(
  dueAt: Date,
  until: Date,
  nonWorkingDates: ReadonlySet<string>,
): number {
  const last = startOfDay(new TZDate(until, LIBRARY_TIMEZONE))
  let day = addDays(startOfDay(new TZDate(dueAt, LIBRARY_TIMEZONE)), 1)
  let count = 0
  while (day <= last) {
    if (!isWeekend(day) && !nonWorkingDates.has(format(day, 'yyyy-MM-dd'))) {
      count++
    }
    day = addDays(day, 1)
  }
  return count
}
