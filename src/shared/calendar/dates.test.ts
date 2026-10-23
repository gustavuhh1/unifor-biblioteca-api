import { describe, expect, it } from 'vitest'
import {
  atLocalTime,
  daysBetween,
  localDate,
  plusDays,
  weekdayOf,
} from './dates.js'

describe('horário de parede em America/Fortaleza (atLocalTime)', () => {
  it('converte para UTC somando 3 horas', () => {
    expect(atLocalTime('2026-10-15', '21:55')).toEqual(
      new Date('2026-10-16T00:55:00Z'),
    )
    expect(atLocalTime('2026-10-10', '14:10')).toEqual(
      new Date('2026-10-10T17:10:00Z'),
    )
  })
})

describe('data local de um instante (localDate)', () => {
  it('usa o dia de Fortaleza, não o de UTC', () => {
    // 15/10 às 23:00 em Fortaleza já é 16/10 em UTC.
    expect(localDate(new Date('2026-10-16T02:00:00Z'))).toBe('2026-10-15')
    expect(localDate(new Date('2026-10-16T03:00:00Z'))).toBe('2026-10-16')
  })
})

describe('soma de dias (plusDays)', () => {
  it('passa de mês e de ano', () => {
    expect(plusDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(plusDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(plusDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('respeita o ano bissexto', () => {
    expect(plusDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(plusDays('2027-02-28', 1)).toBe('2027-03-01')
  })
})

describe('dias entre datas (daysBetween)', () => {
  it('conta dias corridos, negativo quando volta', () => {
    expect(daysBetween('2026-10-10', '2026-10-15')).toBe(5)
    expect(daysBetween('2026-10-15', '2026-10-10')).toBe(-5)
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })
})

describe('dia da semana (weekdayOf)', () => {
  it('devolve a chave de openingHours', () => {
    expect(weekdayOf('2026-10-15')).toBe('thu')
    expect(weekdayOf('2026-10-10')).toBe('sat')
    expect(weekdayOf('2026-10-11')).toBe('sun')
    expect(weekdayOf('2026-10-12')).toBe('mon')
  })
})
