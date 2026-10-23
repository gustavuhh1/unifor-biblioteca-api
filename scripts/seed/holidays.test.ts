import { describe, expect, it } from 'vitest'
import { holidayDates } from '../../src/shared/calendar/holidays-api.js'
import { loadHolidaysFile } from './holidays.js'

describe('arquivo local scripts/data/holidays-2026.json', () => {
  it('tem os feriados de Fortaleza, incluindo o feriado nacional de 12/10', async () => {
    const document = await loadHolidaysFile(2026)

    expect(document).toMatchObject({
      year: 2026,
      cityIbge: '2304400',
      source: 'FeriadosAPI',
    })
    expect(document.items).toHaveLength(15)
    expect(holidayDates(document).has('2026-10-12')).toBe(true)
  })
})
