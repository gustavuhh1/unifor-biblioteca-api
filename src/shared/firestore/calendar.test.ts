import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HolidaysDocument } from '../calendar/holidays-api.js'
import type { FakeFirestore } from '../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../test-support/fake-firestore.js')
const { readLibraryCalendar, refreshHolidays } = await import('./calendar.js')
const { DEFAULT_OPENING_HOURS } = await import('../library.js')
const { isBusinessDay, isOpenDay } =
  await import('../calendar/business-days.js')

const NOW = new Date('2026-10-15T15:00:00Z')

// O que a FeriadosAPI devolveria para 2027.
const holidays2027: HolidaysDocument = {
  year: 2027,
  cityIbge: '2304400',
  items: [{ date: '2027-01-01', name: 'Ano Novo', scope: 'national' }],
  fetchedAt: '2026-10-15T15:00:00.000Z',
  source: 'FeriadosAPI',
}

beforeEach(() => {
  h.db = new Fake()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('calendário da biblioteca (readLibraryCalendar)', () => {
  it('usa os feriados em cache (holidays/{ano}) sem chamar a FeriadosAPI', async () => {
    h.db.put('holidays', '2026', {
      items: [
        { date: '2026-10-12', name: 'N. Sra. Aparecida', scope: 'national' },
      ],
    })
    const fetchHolidays = vi.fn()

    const calendar = await readLibraryCalendar(DEFAULT_OPENING_HOURS, NOW, {
      fetchHolidays,
      apiKey: 'chave-falsa',
    })

    expect(fetchHolidays).not.toHaveBeenCalled()
    expect(calendar.closedDates.has('2026-10-12')).toBe(true)
    expect(isBusinessDay('2026-10-12', calendar.closedDates)).toBe(false)
  })

  it('junta os recessos cadastrados, do primeiro ao último dia', async () => {
    h.db.put('holidays', '2026', { items: [] })
    h.db.put('recesses', 'fim-de-ano', {
      startDate: '2026-10-19',
      endDate: '2026-10-21',
      description: 'Recesso de teste',
    })

    const calendar = await readLibraryCalendar(DEFAULT_OPENING_HOURS, NOW)

    for (const date of ['2026-10-19', '2026-10-20', '2026-10-21']) {
      expect(isOpenDay(date, calendar)).toBe(false)
    }
    expect(isOpenDay('2026-10-22', calendar)).toBe(true)
  })

  it('busca na FeriadosAPI o ano que está sem cache e o guarda em holidays/{ano}', async () => {
    h.db.put('holidays', '2026', { items: [] })
    const fetchHolidays = vi.fn().mockResolvedValue(holidays2027)
    // 31 dias à frente de 20/12 passam para 2027.
    const late = new Date('2026-12-20T15:00:00Z')

    const calendar = await readLibraryCalendar(DEFAULT_OPENING_HOURS, late, {
      fetchHolidays,
      apiKey: 'chave-falsa',
    })

    expect(fetchHolidays).toHaveBeenCalledWith(2027, 'chave-falsa')
    expect(calendar.closedDates.has('2027-01-01')).toBe(true)
    expect(h.db.read('holidays', '2027')).toMatchObject({
      year: 2027,
      cityIbge: '2304400',
      source: 'FeriadosAPI',
      fetchedAt: new Date('2026-10-15T15:00:00.000Z'),
      items: holidays2027.items,
    })
  })

  it('só carrega os anos que o período atravessa', async () => {
    h.db.put('holidays', '2026', { items: [] })
    const fetchHolidays = vi.fn()

    await readLibraryCalendar(DEFAULT_OPENING_HOURS, NOW, {
      fetchHolidays,
      apiKey: 'chave-falsa',
    })

    expect(fetchHolidays).not.toHaveBeenCalled()
  })

  it('segue sem os feriados do ano, e sem gravar cache, quando a FeriadosAPI falha', async () => {
    const fetchHolidays = vi
      .fn()
      .mockRejectedValue(new Error('FeriadosAPI answered HTTP 503.'))

    const calendar = await readLibraryCalendar(DEFAULT_OPENING_HOURS, NOW, {
      fetchHolidays,
      apiKey: 'chave-falsa',
    })

    expect(calendar.closedDates.size).toBe(0)
    expect(h.db.all('holidays')).toEqual([])
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      'chave-falsa',
    )
  })

  it('segue sem os feriados do ano quando não há cache nem chave', async () => {
    const fetchHolidays = vi.fn()

    const calendar = await readLibraryCalendar(DEFAULT_OPENING_HOURS, NOW, {
      fetchHolidays,
      apiKey: undefined,
    })

    expect(fetchHolidays).not.toHaveBeenCalled()
    expect(calendar.closedDates.size).toBe(0)
  })

  it('guarda os horários de funcionamento recebidos', async () => {
    h.db.put('holidays', '2026', { items: [] })

    const calendar = await readLibraryCalendar(DEFAULT_OPENING_HOURS, NOW)

    expect(calendar.openingHours).toEqual(DEFAULT_OPENING_HOURS)
  })
})

describe('feriados do ano no cache (refreshHolidays, RF-SIS-01)', () => {
  it('busca na FeriadosAPI e guarda quando o ano não está no cache', async () => {
    const fetchHolidays = vi.fn().mockResolvedValue(holidays2027)

    const fetched = await refreshHolidays(2027, {
      fetchHolidays,
      apiKey: 'chave-falsa',
    })

    expect(fetched).toBe(true)
    expect(fetchHolidays).toHaveBeenCalledWith(2027, 'chave-falsa')
    expect(h.db.read('holidays', '2027')).toMatchObject({
      year: 2027,
      items: [{ date: '2027-01-01', name: 'Ano Novo', scope: 'national' }],
    })
  })

  it('ano que já está no cache não chama a FeriadosAPI', async () => {
    h.db.put('holidays', '2027', { items: [] })
    const fetchHolidays = vi.fn()

    const fetched = await refreshHolidays(2027, {
      fetchHolidays,
      apiKey: 'chave-falsa',
    })

    expect(fetched).toBe(false)
    expect(fetchHolidays).not.toHaveBeenCalled()
  })

  it('sem a chave da FeriadosAPI lança erro, para a rotina registrar a falha', async () => {
    await expect(
      refreshHolidays(2027, { fetchHolidays: vi.fn(), apiKey: undefined }),
    ).rejects.toThrow('FERIADOS_API_KEY')
    expect(h.db.read('holidays', '2027')).toBeUndefined()
  })

  it('erro da FeriadosAPI lança e não grava o ano', async () => {
    const fetchHolidays = vi
      .fn()
      .mockRejectedValue(new Error('FeriadosAPI answered HTTP 429.'))

    await expect(
      refreshHolidays(2027, { fetchHolidays, apiKey: 'chave-falsa' }),
    ).rejects.toThrow('429')
    expect(h.db.read('holidays', '2027')).toBeUndefined()
  })
})
