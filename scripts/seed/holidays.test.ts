import { describe, expect, it, vi } from 'vitest'
import {
  fetchHolidays,
  holidayDates,
  loadHolidaysFile,
  parseHolidaysResponse,
} from './holidays.js'

const fetchedAt = new Date('2026-10-18T12:00:00Z')

// Formato documentado pela FeriadosAPI: datas em dd/MM/yyyy e tipo em maiúsculas.
const apiResponse = {
  cidade: { ibge: 2304400, nome: 'Fortaleza', uf: 'CE' },
  ano: '2026',
  feriados: [
    {
      id: '2',
      data: '25/03/2026',
      nome: 'Data Magna do Ceará',
      tipo: 'ESTADUAL',
    },
    { id: '1', data: '01/01/2026', nome: 'Ano Novo', tipo: 'NACIONAL' },
    {
      id: '3',
      data: '13/04/2026',
      nome: 'Aniversário de Fortaleza',
      tipo: 'MUNICIPAL',
    },
  ],
  meta: { total: 3, page: 1, per_page: 50, total_pages: 1 },
}

describe('resposta da FeriadosAPI (parseHolidaysResponse)', () => {
  it('converte datas e tipos, em ordem de data', () => {
    const document = parseHolidaysResponse(apiResponse, 2026, fetchedAt)

    expect(document).toEqual({
      year: 2026,
      cityIbge: '2304400',
      fetchedAt: '2026-10-18T12:00:00.000Z',
      source: 'FeriadosAPI',
      items: [
        { date: '2026-01-01', name: 'Ano Novo', scope: 'national' },
        { date: '2026-03-25', name: 'Data Magna do Ceará', scope: 'state' },
        {
          date: '2026-04-13',
          name: 'Aniversário de Fortaleza',
          scope: 'municipal',
        },
      ],
    })
  })

  it('recusa um tipo de feriado desconhecido', () => {
    const body = {
      ...apiResponse,
      feriados: [{ id: '1', data: '01/01/2026', nome: 'X', tipo: 'OUTRO' }],
    }

    expect(() => parseHolidaysResponse(body, 2026, fetchedAt)).toThrow(/OUTRO/)
  })

  it('recusa uma resposta paginada em vez de perder feriados em silêncio', () => {
    const body = { ...apiResponse, meta: { total_pages: 2 } }

    expect(() => parseHolidaysResponse(body, 2026, fetchedAt)).toThrow(/page/)
  })
})

describe('busca na FeriadosAPI (fetchHolidays)', () => {
  it('envia a chave como Bearer token e pede Fortaleza', async () => {
    const fetchMock = vi.fn(async () => Response.json(apiResponse))

    await fetchHolidays(2026, 'dummy-key', fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://feriadosapi.com/api/v1/feriados/cidade/2304400?ano=2026',
      { headers: { Authorization: 'Bearer dummy-key' } },
    )
  })

  it('falha com o status HTTP, nunca com a chave', async () => {
    const fetchMock = vi.fn(async () => new Response('no', { status: 401 }))

    await expect(
      fetchHolidays(2026, 'dummy-key', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow('HTTP 401')
  })
})

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
