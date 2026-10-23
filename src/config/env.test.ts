import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.js'

describe('variáveis de ambiente (parseEnv)', () => {
  it('aplica os padrões e não exige nenhum segredo', () => {
    const env = parseEnv({})

    expect(env.PORT).toBe(8080)
    expect(env.NODE_ENV).toBe('development')
    expect(env.GOOGLE_CLOUD_PROJECT).toBe('estoque-pay')
    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.FERIADOS_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })

  it('converte PORT em número', () => {
    expect(parseEnv({ PORT: '3000' }).PORT).toBe(3000)
  })

  it('trata valores em branco como não definidos', () => {
    const env = parseEnv({ PORT: '', NODE_ENV: '', GEMINI_API_KEY: '' })

    expect(env.PORT).toBe(8080)
    expect(env.NODE_ENV).toBe('development')
    expect(env.GEMINI_API_KEY).toBeUndefined()
  })

  it('mantém os valores informados', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      PASSKEY_RP_ID: 'uni-books.app',
      AUTH_EMAIL_DOMAIN: 'contas.uni-books.app',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8085',
      RESEND_API_KEY: 'dummy-key',
    })

    expect(env.NODE_ENV).toBe('production')
    expect(env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8085')
    expect(env.RESEND_API_KEY).toBe('dummy-key')
  })

  it('rejeita uma PORT inválida', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(/PORT/)
    expect(() => parseEnv({ PORT: '70000' })).toThrow(/PORT/)
  })

  it('rejeita um NODE_ENV desconhecido', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
  })

  describe('PASSKEY_RP_ID e AUTH_EMAIL_DOMAIN', () => {
    const configured = {
      PASSKEY_RP_ID: 'uni-books.app',
      AUTH_EMAIL_DOMAIN: 'contas.uni-books.app',
    }

    it('são opcionais no desenvolvimento e nos testes', () => {
      expect(() => parseEnv({})).not.toThrow()
      expect(() => parseEnv({ NODE_ENV: 'development' })).not.toThrow()
      expect(() => parseEnv({ NODE_ENV: 'test' })).not.toThrow()
    })

    it('são obrigatórias em produção, e o erro diz qual falta', () => {
      expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(
        /PASSKEY_RP_ID is required when NODE_ENV=production[\s\S]*AUTH_EMAIL_DOMAIN is required when NODE_ENV=production/,
      )
      expect(() =>
        parseEnv({ NODE_ENV: 'production', PASSKEY_RP_ID: 'uni-books.app' }),
      ).toThrow(/AUTH_EMAIL_DOMAIN is required/)
      expect(() =>
        parseEnv({
          NODE_ENV: 'production',
          AUTH_EMAIL_DOMAIN: 'contas.uni-books.app',
        }),
      ).toThrow(/PASSKEY_RP_ID is required/)
    })

    it('valor em branco conta como ausente em produção', () => {
      expect(() =>
        parseEnv({ NODE_ENV: 'production', ...configured, PASSKEY_RP_ID: '' }),
      ).toThrow(/PASSKEY_RP_ID is required/)
    })

    it('deixam a API subir em produção quando as duas estão definidas', () => {
      const env = parseEnv({ NODE_ENV: 'production', ...configured })

      expect(env.PASSKEY_RP_ID).toBe('uni-books.app')
      expect(env.AUTH_EMAIL_DOMAIN).toBe('contas.uni-books.app')
    })
  })

  describe('PASSKEY_ANDROID_ORIGINS', () => {
    it('é uma lista vazia quando não definida ou em branco', () => {
      expect(parseEnv({}).PASSKEY_ANDROID_ORIGINS).toEqual([])
      expect(
        parseEnv({ PASSKEY_ANDROID_ORIGINS: '' }).PASSKEY_ANDROID_ORIGINS,
      ).toEqual([])
    })

    it('separa a lista por vírgulas e tira os espaços de cada item', () => {
      const env = parseEnv({
        PASSKEY_ANDROID_ORIGINS:
          'android:apk-key-hash:AbC-_123, android:apk-key-hash:xyz987 ,',
      })

      expect(env.PASSKEY_ANDROID_ORIGINS).toEqual([
        'android:apk-key-hash:AbC-_123',
        'android:apk-key-hash:xyz987',
      ])
    })

    it('rejeita uma origem que não seja android:apk-key-hash:<base64url>', () => {
      expect(() =>
        parseEnv({ PASSKEY_ANDROID_ORIGINS: 'https://example.com' }),
      ).toThrow(/PASSKEY_ANDROID_ORIGINS/)
      expect(() =>
        parseEnv({ PASSKEY_ANDROID_ORIGINS: 'android:apk-key-hash:' }),
      ).toThrow(/PASSKEY_ANDROID_ORIGINS/)
    })
  })
})
