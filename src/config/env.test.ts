import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.js'

describe('parseEnv', () => {
  it('applies the defaults and does not require any secret', () => {
    const env = parseEnv({})

    expect(env.PORT).toBe(8080)
    expect(env.NODE_ENV).toBe('development')
    expect(env.GOOGLE_CLOUD_PROJECT).toBe('estoque-pay')
    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.FERIADOS_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.GOOGLE_BOOKS_API_KEY).toBeUndefined()
  })

  it('converts PORT to a number', () => {
    expect(parseEnv({ PORT: '3000' }).PORT).toBe(3000)
  })

  it('treats blank values as not set', () => {
    const env = parseEnv({ PORT: '', NODE_ENV: '', GEMINI_API_KEY: '' })

    expect(env.PORT).toBe(8080)
    expect(env.NODE_ENV).toBe('development')
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })

  it('keeps the values that were provided', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
      RESEND_API_KEY: 'dummy-key',
    })

    expect(env.NODE_ENV).toBe('production')
    expect(env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8081')
    expect(env.RESEND_API_KEY).toBe('dummy-key')
  })

  it('rejects an invalid PORT', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(/PORT/)
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/PORT/)
  })

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })

  describe('PASSKEY_ANDROID_ORIGINS', () => {
    it('is an empty list when not set or blank', () => {
      expect(parseEnv({}).PASSKEY_ANDROID_ORIGINS).toEqual([])
      expect(
        parseEnv({ PASSKEY_ANDROID_ORIGINS: '' }).PASSKEY_ANDROID_ORIGINS,
      ).toEqual([])
    })

    it('splits the comma separated list and trims each item', () => {
      const env = parseEnv({
        PASSKEY_ANDROID_ORIGINS:
          'android:apk-key-hash:AbC-_123, android:apk-key-hash:xyz987 ,',
      })

      expect(env.PASSKEY_ANDROID_ORIGINS).toEqual([
        'android:apk-key-hash:AbC-_123',
        'android:apk-key-hash:xyz987',
      ])
    })

    it('rejects an origin that is not android:apk-key-hash:<base64url>', () => {
      expect(() =>
        parseEnv({ PASSKEY_ANDROID_ORIGINS: 'https://example.com' }),
      ).toThrow(/PASSKEY_ANDROID_ORIGINS/)
      expect(() =>
        parseEnv({ PASSKEY_ANDROID_ORIGINS: 'android:apk-key-hash:' }),
      ).toThrow(/PASSKEY_ANDROID_ORIGINS/)
    })
  })
})
