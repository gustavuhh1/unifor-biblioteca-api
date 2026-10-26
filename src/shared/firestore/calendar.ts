import { env } from '../../config/env.js'
import { getDb } from '../../config/firebase.js'
import {
  buildLibraryCalendar,
  type LibraryCalendar,
} from '../calendar/business-days.js'
import { daysBetween, localDate, plusDays } from '../calendar/dates.js'
import {
  fetchHolidays,
  type HolidaysDocument,
} from '../calendar/holidays-api.js'
import type {
  DateOnly,
  HolidayItem,
  OpeningHours,
  Recess,
} from '../types/index.js'
import { COLLECTIONS } from './collections.js'

// Leitura do calendário da biblioteca no Firestore (RF-SIS-01, RF-SIS-02): os
// feriados de holidays/{year}, com cache da FeriadosAPI, e os recessos de
// recesses. Juntos com os horários de settings/library formam o LibraryCalendar
// das regras de dia útil (shared/calendar).

// Quantos dias à frente de hoje o calendário cobre: o vencimento de 14 dias, a
// renovação de mais 14 e uma folga. Só esses anos de feriados são carregados.
export const CALENDAR_LOOKAHEAD_DAYS = 31

// Peças trocáveis, para os testes não usarem a rede.
export interface CalendarDeps {
  fetchHolidays?: (year: number, apiKey: string) => Promise<HolidaysDocument>
  apiKey?: string | undefined
}

// Anos (de 4 dígitos) das datas de `from` até `days` dias depois, sem repetir.
function yearsOf(from: Date, days: number): number[] {
  const first = localDate(from)
  const last = plusDays(first, days)
  const years = new Set([first, last].map((date) => Number(date.slice(0, 4))))
  return [...years]
}

// Grava no cache o ano buscado na FeriadosAPI (holidays/{year}, seção 2.19).
async function cacheHolidays(document: HolidaysDocument): Promise<void> {
  const fetchedAt = new Date(document.fetchedAt)
  await getDb()
    .collection(COLLECTIONS.holidays)
    .doc(String(document.year))
    .set({
      ...document,
      fetchedAt,
      createdAt: fetchedAt,
      updatedAt: fetchedAt,
    })
}

// Feriados de um ano: do cache em holidays/{year}; sem cache, busca na FeriadosAPI
// (uma chamada por ano, por causa do limite de 60 por minuto) e guarda. Se a
// busca não for possível (sem chave, rede, erro), devolve uma lista vazia e avisa
// no log, sem registrar chave nem URL: o ano não entra no cache e será tentado de
// novo na próxima vez.
async function holidaysOfYear(
  year: number,
  deps: CalendarDeps,
): Promise<DateOnly[]> {
  const snapshot = await getDb()
    .collection(COLLECTIONS.holidays)
    .doc(String(year))
    .get()
  if (snapshot.exists) {
    return (snapshot.get('items') as HolidayItem[]).map((item) => item.date)
  }

  const apiKey = 'apiKey' in deps ? deps.apiKey : env.FERIADOS_API_KEY
  if (!apiKey) {
    console.warn(
      `Feriados de ${year} indisponíveis: sem cache e sem FERIADOS_API_KEY.`,
    )
    return []
  }
  try {
    const document = await (deps.fetchHolidays ?? fetchHolidays)(year, apiKey)
    await cacheHolidays(document)
    return document.items.map((item) => item.date)
  } catch (error) {
    console.warn(
      `Feriados de ${year} indisponíveis na FeriadosAPI (${error instanceof Error ? error.name : 'erro'}).`,
    )
    return []
  }
}

// Todos os recessos cadastrados (tabela pequena, preenchida à mão).
async function readRecesses(): Promise<
  Pick<Recess, 'startDate' | 'endDate'>[]
> {
  const snapshot = await getDb().collection(COLLECTIONS.recesses).get()
  return snapshot.docs.map((doc) => ({
    startDate: doc.get('startDate') as DateOnly,
    endDate: doc.get('endDate') as DateOnly,
  }))
}

async function buildCalendarForPeriod(
  openingHours: OpeningHours,
  from: Date,
  days: number,
  deps: CalendarDeps,
): Promise<LibraryCalendar> {
  const [holidayLists, recesses] = await Promise.all([
    Promise.all(yearsOf(from, days).map((year) => holidaysOfYear(year, deps))),
    readRecesses(),
  ])
  return buildLibraryCalendar({
    openingHours,
    holidays: holidayLists.flat(),
    recesses,
  })
}

// Monta o calendário da biblioteca para as contas de prazo a partir de `from`
// (RF-EMP-11): horários de settings/library, feriados dos anos que o período
// atravessa e recessos.
export async function readLibraryCalendar(
  openingHours: OpeningHours,
  from: Date,
  deps: CalendarDeps = {},
): Promise<LibraryCalendar> {
  return buildCalendarForPeriod(
    openingHours,
    from,
    CALENDAR_LOOKAHEAD_DAYS,
    deps,
  )
}

// Calendário para um intervalo arbitrário, usado pela multa de um empréstimo
// antigo. Assim uma devolução que atravessou a virada do ano não ignora feriados.
export async function readLibraryCalendarBetween(
  openingHours: OpeningHours,
  from: Date,
  to: Date,
  deps: CalendarDeps = {},
): Promise<LibraryCalendar> {
  const days = Math.max(0, daysBetween(localDate(from), localDate(to)))
  return buildCalendarForPeriod(openingHours, from, days, deps)
}

// Pré-carrega um ano no cache. Devolve true quando foi necessário consultar a
// FeriadosAPI e false quando o documento já existia.
export async function refreshHolidayYear(
  year: number,
  deps: CalendarDeps = {},
): Promise<boolean> {
  const ref = getDb().collection(COLLECTIONS.holidays).doc(String(year))
  if ((await ref.get()).exists) return false
  const apiKey = 'apiKey' in deps ? deps.apiKey : env.FERIADOS_API_KEY
  if (!apiKey) throw new Error('FERIADOS_API_KEY não configurada.')
  const document = await (deps.fetchHolidays ?? fetchHolidays)(year, apiKey)
  await cacheHolidays(document)
  return true
}
