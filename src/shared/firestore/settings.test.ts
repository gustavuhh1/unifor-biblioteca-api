import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OPENING_HOURS } from '../library.js'
import type { FakeFirestore } from '../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../test-support/fake-firestore.js')
const { positiveNumberOr, readLoanSettings, readRequestLimits } =
  await import('./settings.js')

beforeEach(() => {
  h.db = new Fake()
})

describe('número positivo ou o padrão (positiveNumberOr)', () => {
  it('usa o valor quando é um número maior que zero', () => {
    expect(positiveNumberOr(3, 10)).toBe(3)
  })

  it('usa o padrão para zero, negativo, texto e ausente', () => {
    for (const value of [0, -1, '5', null, undefined, Number.NaN]) {
      expect(positiveNumberOr(value, 10)).toBe(10)
    }
  })
})

describe('limites de empréstimos e filas (readRequestLimits)', () => {
  it('lê maxActiveLoans e maxActiveQueues de settings/library', async () => {
    h.db.put('settings', 'library', { maxActiveLoans: 8, maxActiveQueues: 5 })

    expect(await readRequestLimits()).toEqual({
      maxActiveLoans: 8,
      maxActiveQueues: 5,
    })
  })

  it('usa 10 e 7 quando o documento não existe', async () => {
    expect(await readRequestLimits()).toEqual({
      maxActiveLoans: 10,
      maxActiveQueues: 7,
    })
  })

  it('usa o padrão do campo que está inválido', async () => {
    h.db.put('settings', 'library', { maxActiveLoans: 0, maxActiveQueues: 5 })

    expect(await readRequestLimits()).toEqual({
      maxActiveLoans: 10,
      maxActiveQueues: 5,
    })
  })
})

describe('números das regras de empréstimo (readLoanSettings)', () => {
  it('lê os números e o horário de settings/library', async () => {
    h.db.put('settings', 'library', {
      maxActiveLoans: 8,
      maxActiveQueues: 5,
      loanDays: 21,
      renewalDays: 7,
      maxRenewals: 2,
      pickupBusinessDays: 3,
      dueSoonDays: 4,
      queueConfirmHours: 12,
      fineCentsPerBusinessDay: 300,
      openingHours: {
        mon: { open: '08:00', close: '18:00' },
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
    })

    expect(await readLoanSettings()).toMatchObject({
      maxActiveLoans: 8,
      maxActiveQueues: 5,
      loanDays: 21,
      renewalDays: 7,
      maxRenewals: 2,
      pickupBusinessDays: 3,
      dueSoonDays: 4,
      queueConfirmHours: 12,
      fineCentsPerBusinessDay: 300,
      openingHours: { mon: { open: '08:00', close: '18:00' }, tue: null },
      simulatedNow: null,
    })
  })

  it('usa os padrões da seção 2.21 quando o documento não existe', async () => {
    const settings = await readLoanSettings()

    expect(settings).toEqual({
      maxActiveLoans: 10,
      maxActiveQueues: 7,
      loanDays: 14,
      renewalDays: 14,
      maxRenewals: 1,
      pickupBusinessDays: 2,
      dueSoonDays: 2,
      queueConfirmHours: 24,
      fineCentsPerBusinessDay: 200,
      openingHours: DEFAULT_OPENING_HOURS,
      simulatedNow: null,
    })
  })

  it('usa o horário padrão quando o openingHours está incompleto ou inválido', async () => {
    h.db.put('settings', 'library', { openingHours: { mon: { open: '7' } } })

    expect((await readLoanSettings()).openingHours).toEqual(
      DEFAULT_OPENING_HOURS,
    )
  })

  it('lê a data simulada como Date', async () => {
    h.db.put('settings', 'library', {
      simulatedNow: new Date('2026-10-15T15:00:00Z'),
    })

    expect((await readLoanSettings()).simulatedNow).toEqual(
      new Date('2026-10-15T15:00:00Z'),
    )
  })
})
