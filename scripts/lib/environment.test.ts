import { afterEach, describe, expect, it } from 'vitest'
import { emulatorProblems, useProductionDatabase } from './environment.js'

const HOSTS = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']

describe('hosts do emulador (emulatorProblems)', () => {
  it('não acha problema quando todos os hosts estão definidos', () => {
    expect(
      emulatorProblems(
        {
          FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
          FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        },
        HOSTS,
      ),
    ).toEqual([])
  })

  it('aponta cada host que falta, para nunca cair na produção', () => {
    const problems = emulatorProblems({}, HOSTS)

    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toMatch(/FIRESTORE_EMULATOR_HOST/)
    expect(problems.join(' ')).toMatch(/FIREBASE_AUTH_EMULATOR_HOST/)
  })

  it('trata host em branco como ausente e confere só os hosts pedidos', () => {
    expect(
      emulatorProblems({ FIRESTORE_EMULATOR_HOST: '' }, [
        'FIRESTORE_EMULATOR_HOST',
      ]),
    ).toHaveLength(1)
    expect(emulatorProblems({}, [])).toEqual([])
  })
})

describe('banco de produção (useProductionDatabase)', () => {
  const saved = { ...process.env }

  afterEach(() => {
    process.env = { ...saved }
  })

  it('tira as variáveis dos emuladores do ambiente', () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

    useProductionDatabase()

    expect(process.env.FIRESTORE_EMULATOR_HOST).toBeUndefined()
    expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBeUndefined()
  })
})
