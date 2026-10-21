import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../test-support/fake-firestore.js')
const { positiveNumberOr, readRequestLimits } = await import('./settings.js')

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
