import { describe, expect, it } from 'vitest'
import { buildSeed } from './build.js'
import { lateBusinessDays } from '../../src/shared/calendar/business-days.js'
import { atLocalTime } from '../../src/shared/calendar/dates.js'
import { holidayDates } from '../../src/shared/calendar/holidays-api.js'
import { loadHolidaysFile } from './holidays.js'

const RATE_CENTS = 200

describe('multas nos dados do seed', () => {
  // As multas em aberto são congeladas: os dias e os valores não mudam com as datas.
  it.each(['2026-10-15', '2026-10-19', '2027-02-17'])(
    'mantém as 4 multas em aberto fixas quando o seed roda em %s',
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

  it('conta a multa da Marina como 3 dias úteis no dia de exemplo (15/10)', async () => {
    const holidays = await loadHolidaysFile(2026)
    expect(holidayDates(holidays).has('2026-10-12')).toBe(true)

    const { fines } = buildSeed({
      holidays,
      tokenSecret: 'test-secret',
      today: '2026-10-15',
    })

    // Ainda contando: sem valor congelado, calculado na hora.
    expect(fines.fine_marina_calculo1).toMatchObject({ status: 'accruing' })
    expect(fines.fine_marina_calculo1).not.toHaveProperty('amountCents')
    const dueAt = fines.fine_marina_calculo1!.dueAt as Date
    const late = lateBusinessDays(
      dueAt,
      atLocalTime('2026-10-15', '12:00'),
      holidayDates(holidays),
    )
    expect(late).toBe(3)
    expect(late * RATE_CENTS).toBe(600)
  })
})
