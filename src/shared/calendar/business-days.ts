import type { DateOnly, OpeningHours, Recess } from '../types/index.js'
import { atLocalTime, localDate, plusDays, weekdayOf } from './dates.js'

// Regra de dia útil e de prazo da biblioteca (RF-EMP-11, RF-SIS-01 a RF-SIS-03).
// Funções puras: recebem o calendário já carregado e o instante de referência, sem
// Firestore e sem relógio escondido.
//
//   dia útil    segunda a sexta que não seja feriado nem recesso. Sábado e
//               domingo nunca contam (nem para o pedido, nem para a multa).
//   dia aberto  qualquer dia em que openingHours tem horário e que não seja
//               feriado nem recesso. O sábado abre (08:00 às 14:10).
//   prazos      vencem no horário de fechamento do dia em que caem.

// Fechamento usado quando um dia sem horário em openingHours precisa de um (não
// deveria acontecer): o fim do dia.
const FALLBACK_CLOSING = '23:59'

// Limite de dias percorridos ao procurar o próximo dia útil ou aberto, para a
// busca nunca ficar presa num calendário inválido.
const MAX_SEARCH_DAYS = 366

// Calendário da biblioteca: horários por dia da semana e as datas fechadas
// (feriados e dias de recesso).
export interface LibraryCalendar {
  openingHours: OpeningHours
  closedDates: ReadonlySet<DateOnly>
}

// Monta o calendário: junta feriados e dias de recesso (cada recesso vale do
// primeiro ao último dia, inclusive) numa lista só de datas fechadas.
export function buildLibraryCalendar(input: {
  openingHours: OpeningHours
  holidays: Iterable<DateOnly>
  recesses: readonly Pick<Recess, 'startDate' | 'endDate'>[]
}): LibraryCalendar {
  const closedDates = new Set<DateOnly>(input.holidays)
  for (const { startDate, endDate } of input.recesses) {
    for (
      let day = startDate, guard = 0;
      day <= endDate && guard <= MAX_SEARCH_DAYS;
      day = plusDays(day, 1), guard++
    ) {
      closedDates.add(day)
    }
  }
  return { openingHours: input.openingHours, closedDates }
}

// Dia útil: segunda a sexta, sem feriado nem recesso.
export function isBusinessDay(
  date: DateOnly,
  closedDates: ReadonlySet<DateOnly>,
): boolean {
  const weekday = weekdayOf(date)
  return weekday !== 'sat' && weekday !== 'sun' && !closedDates.has(date)
}

// Dia em que a biblioteca abre: tem horário no dia da semana e não é feriado nem
// recesso. O sábado conta.
export function isOpenDay(date: DateOnly, calendar: LibraryCalendar): boolean {
  return (
    calendar.openingHours[weekdayOf(date)] !== null &&
    !calendar.closedDates.has(date)
  )
}

// Instante do fechamento da biblioteca no dia informado (21h55 em dia de
// semana, 14h10 no sábado).
export function closingAt(date: DateOnly, calendar: LibraryCalendar): Date {
  const hours = calendar.openingHours[weekdayOf(date)]
  return atLocalTime(date, hours?.close ?? FALLBACK_CLOSING)
}

// Prazo de N dias úteis depois de `from` (RF-EMP-01, RF-EMP-11): conta só dias
// úteis a partir do dia seguinte e vence no fechamento do último. Pedido feito na
// quinta 15/10 com 2 dias úteis vence na segunda 19/10, às 21h55.
export function addBusinessDays(
  from: Date,
  businessDays: number,
  calendar: LibraryCalendar,
): Date {
  let day = localDate(from)
  let left = businessDays
  for (let guard = 0; left > 0 && guard <= MAX_SEARCH_DAYS; guard++) {
    day = plusDays(day, 1)
    if (isBusinessDay(day, calendar.closedDates)) left--
  }
  return closingAt(day, calendar)
}

// Vencimento de um empréstimo (RF-EMP-11, seção 2.9): `days` dias corridos depois
// de `from`, no fechamento. Se o dia cair em domingo, feriado ou recesso, passa
// para o próximo dia em que a biblioteca abre. Serve à retirada (14 dias) e à
// renovação (+14 dias a partir do vencimento atual).
export function addCalendarDaysToClosing(
  from: Date,
  days: number,
  calendar: LibraryCalendar,
): Date {
  let day = plusDays(localDate(from), days)
  for (
    let guard = 0;
    !isOpenDay(day, calendar) && guard <= MAX_SEARCH_DAYS;
    guard++
  ) {
    day = plusDays(day, 1)
  }
  return closingAt(day, calendar)
}

// Dias úteis de atraso (RF-MUL-01): os dias úteis depois do dia do vencimento até
// o dia de `until`, inclusive. Venceu no sábado 10/10, hoje quinta 15/10, 12/10
// feriado: 13, 14 e 15 = 3 dias. Nada é contado no dia do vencimento nem antes.
export function lateBusinessDays(
  dueAt: Date,
  until: Date,
  closedDates: ReadonlySet<DateOnly>,
): number {
  const last = localDate(until)
  let count = 0
  for (
    let day = plusDays(localDate(dueAt), 1);
    day <= last;
    day = plusDays(day, 1)
  ) {
    if (isBusinessDay(day, closedDates)) count++
  }
  return count
}
