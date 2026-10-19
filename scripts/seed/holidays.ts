import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { HolidayItem } from '../../src/shared/types/index.js'

// Código IBGE de Fortaleza. Uma chamada por ano traz os feriados nacionais,
// estaduais (Ceará) e municipais (docs/infra.md, seção 3).
export const FORTALEZA_IBGE = '2304400'

const API_URL = 'https://feriadosapi.com/api/v1/feriados/cidade'

// Formato de holidays/{year} (docs/modelo-de-dados-firestore.md, seção 2.19),
// com `fetchedAt` em texto ISO, para o mesmo formato poder ficar num arquivo JSON.
export interface HolidaysDocument {
  year: number
  cityIbge: string
  items: HolidayItem[]
  fetchedAt: string
  source: 'FeriadosAPI'
}

const scopeByType: Record<string, HolidayItem['scope']> = {
  NACIONAL: 'national',
  ESTADUAL: 'state',
  MUNICIPAL: 'municipal',
}

const responseSchema = z.object({
  feriados: z.array(
    z.object({
      data: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
      nome: z.string(),
      tipo: z.string(),
    }),
  ),
  meta: z.object({ total_pages: z.number() }),
})

// Converte a resposta da FeriadosAPI nos feriados do formato do projeto, em
// ordem de data.
export function parseHolidaysResponse(
  body: unknown,
  year: number,
  fetchedAt: Date,
): HolidaysDocument {
  const parsed = responseSchema.parse(body)
  if (parsed.meta.total_pages > 1) {
    throw new Error('FeriadosAPI returned more than one page; not supported.')
  }

  const items = parsed.feriados.map((holiday): HolidayItem => {
    const scope = scopeByType[holiday.tipo.toUpperCase()]
    if (!scope) {
      throw new Error(`Unknown FeriadosAPI holiday type: ${holiday.tipo}`)
    }
    const [day, month, holidayYear] = holiday.data.split('/')
    return {
      date: `${holidayYear}-${month}-${day}`,
      name: holiday.nome,
      scope,
    }
  })
  items.sort((a, b) => a.date.localeCompare(b.date))

  return {
    year,
    cityIbge: FORTALEZA_IBGE,
    items,
    fetchedAt: fetchedAt.toISOString(),
    source: 'FeriadosAPI',
  }
}

// Busca na FeriadosAPI os feriados de Fortaleza de um ano.
export async function fetchHolidays(
  year: number,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HolidaysDocument> {
  const response = await fetchImpl(`${API_URL}/${FORTALEZA_IBGE}?ano=${year}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    throw new Error(`FeriadosAPI answered HTTP ${response.status}.`)
  }
  return parseHolidaysResponse(await response.json(), year, new Date())
}

// Lê os feriados do arquivo local de um ano (modo --offline).
export async function loadHolidaysFile(
  year: number,
): Promise<HolidaysDocument> {
  const file = new URL(`../data/holidays-${year}.json`, import.meta.url)
  return JSON.parse(await readFile(file, 'utf8')) as HolidaysDocument
}

// Datas ("AAAA-MM-DD") em que multas e prazos não contam um dia.
export function holidayDates(document: HolidaysDocument): Set<string> {
  return new Set(document.items.map((item) => item.date))
}
