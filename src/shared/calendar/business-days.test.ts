import { describe, expect, it } from 'vitest'
import { DEFAULT_OPENING_HOURS } from '../library.js'
import {
  addBusinessDays,
  addCalendarDaysToClosing,
  buildLibraryCalendar,
  closingAt,
  isBusinessDay,
  isOpenDay,
  lateBusinessDays,
  type LibraryCalendar,
} from './business-days.js'
import { atLocalTime } from './dates.js'

const RATE_CENTS = 200

// Calendário de teste: 12/10 (feriado nacional), 01/01/2027 (Ano Novo) e o recesso
// de fim de ano de 22/12 a 03/01.
const CALENDAR: LibraryCalendar = buildLibraryCalendar({
  openingHours: DEFAULT_OPENING_HOURS,
  holidays: ['2026-10-12', '2026-11-02', '2027-01-01'],
  recesses: [{ startDate: '2026-12-22', endDate: '2027-01-03' }],
})

// Só a regra do fim de semana e do feriado de 12/10, sem recesso.
const HOLIDAYS = new Set(['2026-10-12'])

describe('calendário (buildLibraryCalendar)', () => {
  it('junta feriados e recesso, com o recesso do primeiro ao último dia', () => {
    for (const date of ['2026-12-22', '2026-12-31', '2027-01-03']) {
      expect(CALENDAR.closedDates.has(date)).toBe(true)
    }
    expect(CALENDAR.closedDates.has('2026-12-21')).toBe(false)
    expect(CALENDAR.closedDates.has('2027-01-04')).toBe(false)
    expect(CALENDAR.closedDates.has('2026-10-12')).toBe(true)
  })
})

describe('dia útil e dia aberto (isBusinessDay, isOpenDay)', () => {
  it('fim de semana nunca é dia útil', () => {
    expect(isBusinessDay('2026-10-10', new Set())).toBe(false) // sábado
    expect(isBusinessDay('2026-10-11', new Set())).toBe(false) // domingo
    expect(isBusinessDay('2026-10-09', new Set())).toBe(true) // sexta
  })

  it('feriado e recesso não são dias úteis', () => {
    expect(isBusinessDay('2026-10-12', CALENDAR.closedDates)).toBe(false)
    expect(isBusinessDay('2026-12-23', CALENDAR.closedDates)).toBe(false)
    expect(isBusinessDay('2026-10-13', CALENDAR.closedDates)).toBe(true)
  })

  it('o sábado abre; o domingo, o feriado e o recesso não', () => {
    expect(isOpenDay('2026-10-10', CALENDAR)).toBe(true)
    expect(isOpenDay('2026-10-11', CALENDAR)).toBe(false)
    expect(isOpenDay('2026-10-12', CALENDAR)).toBe(false)
    expect(isOpenDay('2026-12-23', CALENDAR)).toBe(false)
    expect(isOpenDay('2026-10-13', CALENDAR)).toBe(true)
  })

  it('sábado que é feriado fica fechado', () => {
    const calendar = buildLibraryCalendar({
      openingHours: DEFAULT_OPENING_HOURS,
      holidays: ['2026-10-10'],
      recesses: [],
    })

    expect(isOpenDay('2026-10-10', calendar)).toBe(false)
  })
})

describe('fechamento do dia (closingAt)', () => {
  it('21h55 em dia de semana e 14h10 no sábado', () => {
    expect(closingAt('2026-10-15', CALENDAR)).toEqual(
      new Date('2026-10-16T00:55:00Z'),
    )
    expect(closingAt('2026-10-10', CALENDAR)).toEqual(
      new Date('2026-10-10T17:10:00Z'),
    )
  })
})

describe('prazo em dias úteis (addBusinessDays)', () => {
  const at = (date: string) => atLocalTime(date, '09:30')

  it('pedido na quinta 15/10 vence na segunda 19/10, às 21h55 (pula o fim de semana)', () => {
    expect(addBusinessDays(at('2026-10-15'), 2, CALENDAR)).toEqual(
      atLocalTime('2026-10-19', '21:55'),
    )
  })

  it('pedido na terça vence na quinta', () => {
    expect(addBusinessDays(at('2026-10-13'), 2, CALENDAR)).toEqual(
      atLocalTime('2026-10-15', '21:55'),
    )
  })

  it('pedido no sábado ou no domingo conta a partir da segunda', () => {
    expect(addBusinessDays(at('2026-10-17'), 2, CALENDAR)).toEqual(
      atLocalTime('2026-10-20', '21:55'),
    )
    expect(addBusinessDays(at('2026-10-18'), 2, CALENDAR)).toEqual(
      atLocalTime('2026-10-20', '21:55'),
    )
  })

  it('pula o feriado: pedido na sexta 09/10, com 12/10 feriado, vence na quarta 14/10', () => {
    expect(addBusinessDays(at('2026-10-09'), 2, CALENDAR)).toEqual(
      atLocalTime('2026-10-14', '21:55'),
    )
  })

  it('pula o recesso e a virada de ano: pedido em 21/12 vence em 05/01/2027', () => {
    // 22/12 a 03/01 é recesso (e 01/01 feriado): 04/01 é o 1º e 05/01 o 2º.
    expect(addBusinessDays(at('2026-12-21'), 2, CALENDAR)).toEqual(
      atLocalTime('2027-01-05', '21:55'),
    )
  })

  it('atravessa o ano sem recesso: pedido em 30/12 vence em 04/01/2027', () => {
    const calendar = buildLibraryCalendar({
      openingHours: DEFAULT_OPENING_HOURS,
      holidays: ['2027-01-01'],
      recesses: [],
    })

    // 31/12 (1º), 01/01 feriado, 04/01 (2º).
    expect(addBusinessDays(at('2026-12-30'), 2, calendar)).toEqual(
      atLocalTime('2027-01-04', '21:55'),
    )
  })

  it('usa o dia local: pedido às 23h de Fortaleza ainda é do mesmo dia', () => {
    // 02:00 UTC de sexta = 23:00 de quinta em Fortaleza: conta a partir de sexta.
    expect(
      addBusinessDays(new Date('2026-10-16T02:00:00Z'), 2, CALENDAR),
    ).toEqual(atLocalTime('2026-10-19', '21:55'))
  })

  it('zero dia útil vence no fechamento do próprio dia', () => {
    expect(addBusinessDays(at('2026-10-15'), 0, CALENDAR)).toEqual(
      atLocalTime('2026-10-15', '21:55'),
    )
  })
})

describe('vencimento do empréstimo (addCalendarDaysToClosing)', () => {
  const at = (date: string, time = '12:00') => atLocalTime(date, time)

  it('14 dias corridos depois, no fechamento (Lucas: retirou 02/10, vence 16/10)', () => {
    expect(addCalendarDaysToClosing(at('2026-10-02'), 14, CALENDAR)).toEqual(
      atLocalTime('2026-10-16', '21:55'),
    )
  })

  it('sábado com balcão aberto vale, com o fechamento das 14h10 (Marina: 26/09 a 10/10)', () => {
    expect(addCalendarDaysToClosing(at('2026-09-26'), 14, CALENDAR)).toEqual(
      atLocalTime('2026-10-10', '14:10'),
    )
  })

  it('domingo passa para a segunda', () => {
    expect(addCalendarDaysToClosing(at('2026-10-04'), 14, CALENDAR)).toEqual(
      atLocalTime('2026-10-19', '21:55'),
    )
  })

  it('feriado passa para o próximo dia aberto (12/10 vai para 13/10)', () => {
    expect(addCalendarDaysToClosing(at('2026-09-28'), 14, CALENDAR)).toEqual(
      atLocalTime('2026-10-13', '21:55'),
    )
  })

  it('feriado seguido de domingo passa para a segunda', () => {
    const calendar = buildLibraryCalendar({
      openingHours: DEFAULT_OPENING_HOURS,
      holidays: ['2026-10-17'],
      recesses: [],
    })

    // Sábado 17/10 fechado + domingo 18/10: segunda 19/10.
    expect(addCalendarDaysToClosing(at('2026-10-03'), 14, calendar)).toEqual(
      atLocalTime('2026-10-19', '21:55'),
    )
  })

  it('vencimento no recesso vai para o primeiro dia aberto depois dele, mesmo virando o ano', () => {
    // 10/12 + 14 = 24/12, dentro do recesso de 22/12 a 03/01: abre na segunda 04/01.
    expect(addCalendarDaysToClosing(at('2026-12-10'), 14, CALENDAR)).toEqual(
      atLocalTime('2027-01-04', '21:55'),
    )
  })

  it('a renovação soma +14 dias ao vencimento atual com a mesma regra', () => {
    const dueAt = atLocalTime('2026-10-16', '21:55')

    expect(addCalendarDaysToClosing(dueAt, 14, CALENDAR)).toEqual(
      atLocalTime('2026-10-30', '21:55'),
    )
  })

  it('a renovação que cai em feriado passa para o próximo dia aberto', () => {
    // 19/10 + 14 = 02/11 (Finados, feriado de teste): vai para terça 03/11.
    expect(
      addCalendarDaysToClosing(
        atLocalTime('2026-10-19', '21:55'),
        14,
        CALENDAR,
      ),
    ).toEqual(atLocalTime('2026-11-03', '21:55'))
  })
})

describe('dias úteis de atraso (lateBusinessDays)', () => {
  // docs/modelo-de-dados-firestore.md, seção 6.5: vencimento, devolução, dias e centavos.
  it.each([
    ['Pedro Henrique Lima', '2026-10-05', '2026-10-13', 5, 1000],
    ['Júlia Martins', '2026-10-07', '2026-10-09', 2, 400],
    ['Camila Rocha', '2026-09-28', '2026-10-02', 4, 800],
    ['Diego Alves', '2026-09-25', '2026-09-30', 3, 600],
  ])('%s: multa em aberto', (_name, dueOn, returnedOn, days, cents) => {
    const late = lateBusinessDays(
      atLocalTime(dueOn, '21:55'),
      atLocalTime(returnedOn, '12:00'),
      HOLIDAYS,
    )

    expect(late).toBe(days)
    expect(late * RATE_CENTS).toBe(cents)
  })

  it('Marina: venceu no sábado 10/10, 3 dias úteis até quinta 15/10 (R$ 6,00)', () => {
    const late = lateBusinessDays(
      atLocalTime('2026-10-10', '14:10'),
      atLocalTime('2026-10-15', '12:00'),
      HOLIDAYS,
    )

    expect(late).toBe(3)
    expect(late * RATE_CENTS).toBe(600)
  })

  it('não pula o feriado quando ele não está na lista', () => {
    expect(
      lateBusinessDays(
        atLocalTime('2026-10-10', '14:10'),
        atLocalTime('2026-10-15', '12:00'),
        new Set(),
      ),
    ).toBe(4)
  })

  it('não conta nada no dia do vencimento nem antes dele', () => {
    const due = atLocalTime('2026-10-05', '21:55')

    expect(
      lateBusinessDays(due, atLocalTime('2026-10-05', '23:00'), HOLIDAYS),
    ).toBe(0)
    expect(
      lateBusinessDays(due, atLocalTime('2026-10-02', '12:00'), HOLIDAYS),
    ).toBe(0)
  })

  it('não conta fins de semana', () => {
    expect(
      lateBusinessDays(
        atLocalTime('2026-10-09', '21:55'),
        atLocalTime('2026-10-11', '12:00'),
        HOLIDAYS,
      ),
    ).toBe(0)
  })

  it('não conta os dias de recesso e atravessa a virada do ano', () => {
    // Venceu na sexta 18/12; hoje terça 05/01/2027. Dias úteis: 21/12 (seg), e 04 e
    // 05/01; 22/12 a 03/01 é recesso (e 01/01 feriado).
    expect(
      lateBusinessDays(
        atLocalTime('2026-12-18', '21:55'),
        atLocalTime('2027-01-05', '10:00'),
        CALENDAR.closedDates,
      ),
    ).toBe(3)
  })
})
