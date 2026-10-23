import { readFile } from 'node:fs/promises'
import type { HolidaysDocument } from '../../src/shared/calendar/holidays-api.js'

// Lê os feriados do arquivo local de um ano (modo --offline). A busca na
// FeriadosAPI e a leitura dos feriados fica em src/shared/calendar.
export async function loadHolidaysFile(
  year: number,
): Promise<HolidaysDocument> {
  const file = new URL(`../data/holidays-${year}.json`, import.meta.url)
  return JSON.parse(await readFile(file, 'utf8')) as HolidaysDocument
}
