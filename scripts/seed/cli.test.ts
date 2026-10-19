import { describe, expect, it } from 'vitest'
import { checkEnvironment, parseCliArgs } from './cli.js'

const EMULATORS = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
}

describe('argumentos da linha de comando (parseCliArgs)', () => {
  it('por padrão usa o emulador, com Google Books', () => {
    expect(parseCliArgs([])).toEqual({
      prod: false,
      reset: false,
      googleBooks: true,
      offline: false,
    })
  })

  it('lê as opções', () => {
    expect(parseCliArgs(['--prod', '--reset', '--no-google-books'])).toEqual({
      prod: true,
      reset: true,
      googleBooks: false,
      offline: false,
    })
  })

  it('--offline também pula o Google Books', () => {
    expect(parseCliArgs(['--offline'])).toMatchObject({
      offline: true,
      googleBooks: false,
    })
  })

  it('recusa uma opção desconhecida', () => {
    expect(() => parseCliArgs(['--production'])).toThrow()
  })
})

describe('conferência do ambiente (checkEnvironment)', () => {
  const emulatorRun = parseCliArgs([])

  it('para com uma mensagem clara quando falta SEED_TEST_PASSWORD', () => {
    const problems = checkEnvironment(emulatorRun, { ...EMULATORS })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/SEED_TEST_PASSWORD não está definida/)
  })

  it('trata SEED_TEST_PASSWORD em branco como ausente', () => {
    const problems = checkEnvironment(emulatorRun, {
      ...EMULATORS,
      SEED_TEST_PASSWORD: '',
    })

    expect(problems[0]).toMatch(/SEED_TEST_PASSWORD/)
  })

  it('recusa uma senha que o Firebase recusaria', () => {
    const problems = checkEnvironment(emulatorRun, {
      ...EMULATORS,
      SEED_TEST_PASSWORD: '12345',
    })

    expect(problems[0]).toMatch(/pelo menos 6/)
  })

  it('aceita uma configuração válida do emulador', () => {
    expect(
      checkEnvironment(emulatorRun, {
        ...EMULATORS,
        SEED_TEST_PASSWORD: 'dummy-pass',
      }),
    ).toEqual([])
  })

  it('nunca cai para a produção quando faltam os hosts do emulador', () => {
    const problems = checkEnvironment(emulatorRun, {
      SEED_TEST_PASSWORD: 'dummy-pass',
    })

    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toMatch(/FIRESTORE_EMULATOR_HOST/)
    expect(problems.join(' ')).toMatch(/FIREBASE_AUTH_EMULATOR_HOST/)
  })

  it('não precisa dos hosts do emulador com --prod', () => {
    expect(
      checkEnvironment(parseCliArgs(['--prod']), {
        SEED_TEST_PASSWORD: 'dummy-pass',
      }),
    ).toEqual([])
  })
})
