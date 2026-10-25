import { env } from '../../config/env.js'
import { getDb } from '../../config/firebase.js'
import {
  buildLibraryCalendar,
  type LibraryCalendar,
} from '../calendar/business-days.js'
import { localDate, plusDays } from '../calendar/dates.js'
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

  const apiKey = apiKeyOf(deps)
  if (!apiKey) {
    console.warn(
      `Feriados de ${year} indisponíveis: sem cache e sem FERIADOS_API_KEY.`,
    )
    return []
  }
  try {
    const document = await fetchAndCache(year, apiKey, deps)
    return document.items.map((item) => item.date)
  } catch (error) {
    console.warn(
      `Feriados de ${year} indisponíveis na FeriadosAPI (${error instanceof Error ? error.name : 'erro'}).`,
    )
    return []
  }
}

// Busca o ano na FeriadosAPI e o guarda no cache.
async function fetchAndCache(
  year: number,
  apiKey: string,
  deps: CalendarDeps,
): Promise<HolidaysDocument> {
  const document = await (deps.fetchHolidays ?? fetchHolidays)(year, apiKey)
  await cacheHolidays(document)
  return document
}

// A chave da FeriadosAPI: a dos testes (deps) ou a do ambiente.
function apiKeyOf(deps: CalendarDeps): string | undefined {
  return 'apiKey' in deps ? deps.apiKey : env.FERIADOS_API_KEY
}

// Garante os feriados do ano no cache (RF-SIS-01, rotina `refresh_holidays`): se
// holidays/{year} já existe, não faz nada; senão busca na FeriadosAPI e guarda.
// Devolve true quando buscou agora. Diferente da leitura do dia a dia, que segue
// sem feriados se a busca falhar, aqui a falha (sem chave, rede, erro da API) é
// lançada, para a rotina registrar o erro.
export async function refreshHolidays(
  year: number,
  deps: CalendarDeps = {},
): Promise<boolean> {
  const cached = await getDb()
    .collection(COLLECTIONS.holidays)
    .doc(String(year))
    .get()
  if (cached.exists) return false

  const apiKey = apiKeyOf(deps)
  if (!apiKey) throw new Error('FERIADOS_API_KEY não está definida.')
  await fetchAndCache(year, apiKey, deps)
  return true
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

// Monta o calendário da biblioteca para as contas de prazo a partir de `from`
// (RF-EMP-11): horários de settings/library, feriados dos anos que o período
// atravessa e recessos.
export async function readLibraryCalendar(
  openingHours: OpeningHours,
  from: Date,
  deps: CalendarDeps = {},
): Promise<LibraryCalendar> {
  const [holidayLists, recesses] = await Promise.all([
    Promise.all(
      yearsOf(from, CALENDAR_LOOKAHEAD_DAYS).map((year) =>
        holidaysOfYear(year, deps),
      ),
    ),
    readRecesses(),
  ])
  return buildLibraryCalendar({
    openingHours,
    holidays: holidayLists.flat(),
    recesses,
  })
}
