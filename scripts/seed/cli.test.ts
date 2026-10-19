import { describe, expect, it } from 'vitest'
import { checkEnvironment, parseCliArgs } from './cli.js'

const EMULATORS = {
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
}

describe('parseCliArgs', () => {
  it('defaults to the emulator, with Google Books', () => {
    expect(parseCliArgs([])).toEqual({
      prod: false,
      reset: false,
      googleBooks: true,
      offline: false,
    })
  })

  it('reads the flags', () => {
    expect(parseCliArgs(['--prod', '--reset', '--no-google-books'])).toEqual({
      prod: true,
      reset: true,
      googleBooks: false,
      offline: false,
    })
  })

  it('--offline also skips Google Books', () => {
    expect(parseCliArgs(['--offline'])).toMatchObject({
      offline: true,
      googleBooks: false,
    })
  })

  it('refuses an unknown flag', () => {
    expect(() => parseCliArgs(['--production'])).toThrow()
  })
})

describe('checkEnvironment', () => {
  const emulatorRun = parseCliArgs([])

  it('stops with a clear message when SEED_TEST_PASSWORD is missing', () => {
    const problems = checkEnvironment(emulatorRun, { ...EMULATORS })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/SEED_TEST_PASSWORD não está definida/)
  })

  it('treats a blank SEED_TEST_PASSWORD as missing', () => {
    const problems = checkEnvironment(emulatorRun, {
      ...EMULATORS,
      SEED_TEST_PASSWORD: '',
    })

    expect(problems[0]).toMatch(/SEED_TEST_PASSWORD/)
  })

  it('refuses a password the Firebase would refuse', () => {
    const problems = checkEnvironment(emulatorRun, {
      ...EMULATORS,
      SEED_TEST_PASSWORD: '12345',
    })

    expect(problems[0]).toMatch(/pelo menos 6/)
  })

  it('accepts a valid emulator setup', () => {
    expect(
      checkEnvironment(emulatorRun, {
        ...EMULATORS,
        SEED_TEST_PASSWORD: 'dummy-pass',
      }),
    ).toEqual([])
  })

  it('never falls back to production when the emulator hosts are missing', () => {
    const problems = checkEnvironment(emulatorRun, {
      SEED_TEST_PASSWORD: 'dummy-pass',
    })

    expect(problems).toHaveLength(2)
    expect(problems.join(' ')).toMatch(/FIRESTORE_EMULATOR_HOST/)
    expect(problems.join(' ')).toMatch(/FIREBASE_AUTH_EMULATOR_HOST/)
  })

  it('does not need the emulator hosts with --prod', () => {
    expect(
      checkEnvironment(parseCliArgs(['--prod']), {
        SEED_TEST_PASSWORD: 'dummy-pass',
      }),
    ).toEqual([])
  })
})
