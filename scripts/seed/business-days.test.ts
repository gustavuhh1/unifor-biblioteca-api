import { describe, expect, it } from 'vitest'
import { buildSeed } from './build.js'
import { lateBusinessDays } from './business-days.js'
import { holidayDates, loadHolidaysFile } from './holidays.js'
import { at } from './time.js'

const RATE_CENTS = 200
// 12/10 is the only holiday that matters in the documented fines (section 6.5).
const HOLIDAYS = new Set(['2026-10-12'])

describe('lateBusinessDays', () => {
  // docs/modelo-de-dados-firestore.md, section 6.5: due date, return date, days, cents.
  it.each([
    ['Pedro Henrique Lima', '2026-10-05', '2026-10-13', 5, 1000],
    ['Júlia Martins', '2026-10-07', '2026-10-09', 2, 400],
    ['Camila Rocha', '2026-09-28', '2026-10-02', 4, 800],
    ['Diego Alves', '2026-09-25', '2026-09-30', 3, 600],
  ])('%s: open fine', (_name, dueOn, returnedOn, days, cents) => {
    const late = lateBusinessDays(
      at(dueOn, '21:55'),
      at(returnedOn, '12:00'),
      HOLIDAYS,
    )

    expect(late).toBe(days)
    expect(late * RATE_CENTS).toBe(cents)
  })

  it('Marina: due on Saturday 10/10, 3 business days until Thursday 15/10 (R$ 6,00)', () => {
    const late = lateBusinessDays(
      at('2026-10-10', '14:10'),
      at('2026-10-15', '12:00'),
      HOLIDAYS,
    )

    expect(late).toBe(3)
    expect(late * RATE_CENTS).toBe(600)
  })

  it('does not skip the holiday when it is not listed', () => {
    expect(
      lateBusinessDays(
        at('2026-10-10', '14:10'),
        at('2026-10-15', '12:00'),
        new Set(),
      ),
    ).toBe(4)
  })

  it('counts nothing on the due date itself or before it', () => {
    const due = at('2026-10-05', '21:55')

    expect(lateBusinessDays(due, at('2026-10-05', '23:00'), HOLIDAYS)).toBe(0)
    expect(lateBusinessDays(due, at('2026-10-02', '12:00'), HOLIDAYS)).toBe(0)
  })

  it('does not count weekends', () => {
    expect(
      lateBusinessDays(
        at('2026-10-09', '21:55'),
        at('2026-10-11', '12:00'),
        HOLIDAYS,
      ),
    ).toBe(0)
  })
})

describe('fines in the seed data', () => {
  // The open fines are frozen: their days and amounts do not move with the dates.
  it.each(['2026-10-15', '2026-10-19', '2027-02-17'])(
    'keeps the 4 open fines fixed when the seed runs on %s',
    async (today) => {
      const holidays = await loadHolidaysFile(2026)
      const { fines } = buildSeed({
        holidays,
        tokenSecret: 'test-secret',
        today,
      })

      expect(fines.fine_pedrohenrique_fisica).toMatchObject({
        status: 'open',
        businessDaysLate: 5,
        amountCents: 1000,
      })
      expect(fines.fine_julia_contabilidade).toMatchObject({
        businessDaysLate: 2,
        amountCents: 400,
      })
      expect(fines.fine_camila_direito).toMatchObject({
        businessDaysLate: 4,
        amountCents: 800,
      })
      expect(fines.fine_diego_anatomia).toMatchObject({
        businessDaysLate: 3,
        amountCents: 600,
      })
    },
  )

  it("counts Marina's accruing fine as 3 business days on the example day (15/10)", async () => {
    const holidays = await loadHolidaysFile(2026)
    expect(holidayDates(holidays).has('2026-10-12')).toBe(true)

    const { fines } = buildSeed({
      holidays,
      tokenSecret: 'test-secret',
      today: '2026-10-15',
    })

    // Still accruing: no frozen amount, computed on the fly.
    expect(fines.fine_marina_calculo1).toMatchObject({ status: 'accruing' })
    expect(fines.fine_marina_calculo1).not.toHaveProperty('amountCents')
    const dueAt = fines.fine_marina_calculo1!.dueAt as Date
    const late = lateBusinessDays(
      dueAt,
      at('2026-10-15', '12:00'),
      holidayDates(holidays),
    )
    expect(late).toBe(3)
    expect(late * RATE_CENTS).toBe(600)
  })
})
