import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  nodeEnv: 'development',
}))

vi.mock('../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../config/env.js', () => ({
  env: {
    get NODE_ENV() {
      return h.nodeEnv
    },
  },
}))

const { FakeFirestore: Fake } =
  await import('../test-support/fake-firestore.js')
const { now, nowOf, resolveNow } = await import('./clock.js')

const REAL = new Date('2026-10-21T15:00:00Z')
const SIMULATED = new Date('2026-10-15T15:00:00Z')

beforeEach(() => {
  h.db = new Fake()
  h.nodeEnv = 'development'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(REAL)
})

describe('o agora das regras (resolveNow)', () => {
  it('usa a data simulada fora de produção', () => {
    expect(resolveNow(SIMULATED, false, REAL)).toEqual(SIMULATED)
  })

  it('ignora a data simulada em produção', () => {
    expect(resolveNow(SIMULATED, true, REAL)).toEqual(REAL)
  })

  it('usa o instante real quando não há data simulada', () => {
    expect(resolveNow(null, false, REAL)).toEqual(REAL)
    expect(resolveNow(undefined, false, REAL)).toEqual(REAL)
  })
})

describe('agora a partir de settings já lidos (nowOf)', () => {
  it('simula fora de produção e ignora em produção', () => {
    expect(nowOf({ simulatedNow: SIMULATED })).toEqual(SIMULATED)

    h.nodeEnv = 'production'
    expect(nowOf({ simulatedNow: SIMULATED })).toEqual(REAL)
  })
})

describe('o relógio único (now)', () => {
  it('devolve o instante atual quando settings não tem data simulada', async () => {
    h.db.put('settings', 'library', { simulatedNow: null })

    expect(await now()).toEqual(REAL)
  })

  it('devolve o instante atual sem o documento de settings', async () => {
    expect(await now()).toEqual(REAL)
  })

  it('lê simulatedNow de settings/library fora de produção (RF-SIS-04)', async () => {
    h.db.put('settings', 'library', { simulatedNow: SIMULATED })

    expect(await now()).toEqual(SIMULATED)
  })

  it('em produção ignora simulatedNow', async () => {
    h.nodeEnv = 'production'
    h.db.put('settings', 'library', { simulatedNow: SIMULATED })

    expect(await now()).toEqual(REAL)
  })
})
