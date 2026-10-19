import { describe, expect, it } from 'vitest'
import { RESEND_COOLDOWN_SECONDS } from '../auth.constants.js'
import type { StoredToken } from '../auth.types.js'
import {
  checkToken,
  createTokenSecret,
  hashTokenCode,
  resendWaitSeconds,
  tokenExpiresAt,
} from '../rules/email-token.rules.js'

const NOW = new Date('2026-10-19T12:00:00Z')

function storedToken(overrides: Partial<StoredToken> = {}): StoredToken {
  return {
    codeHash: hashTokenCode('123456', 'salt'),
    salt: 'salt',
    expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    usedAt: null,
    invalidatedAt: null,
    attempts: 0,
    ...overrides,
  }
}

describe('geração do token de e-mail (createTokenSecret)', () => {
  it('gera um código de seis dígitos, mantendo os zeros à esquerda', () => {
    for (let i = 0; i < 200; i++) {
      expect(createTokenSecret().code).toMatch(/^\d{6}$/)
    }
  })

  it('faz o hash do código com salt próprio e nunca guarda o código no hash', () => {
    const first = createTokenSecret()
    const second = createTokenSecret()

    expect(first.codeHash).toBe(hashTokenCode(first.code, first.salt))
    expect(first.salt).not.toBe(second.salt)
    expect(first.codeHash).not.toContain(first.code)
    expect(first.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('dá hash diferente ao mesmo código com outro salt', () => {
    expect(hashTokenCode('123456', 'a')).not.toBe(hashTokenCode('123456', 'b'))
  })
})

describe('validade do token (tokenExpiresAt)', () => {
  it('soma a validade em minutos (20 por padrão no modelo)', () => {
    expect(tokenExpiresAt(NOW, 20).toISOString()).toBe(
      '2026-10-19T12:20:00.000Z',
    )
  })
})

describe('conferência do token (checkToken)', () => {
  it('aceita o código certo de um token ainda válido', () => {
    expect(checkToken(storedToken(), '123456', NOW, 5)).toEqual({
      result: 'valid',
    })
  })

  it('recusa o token a partir do momento em que vence', () => {
    const token = storedToken({ expiresAt: NOW })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({
      result: 'expired_or_used',
    })
    expect(
      checkToken(token, '123456', new Date(NOW.getTime() + 1000), 5),
    ).toEqual({ result: 'expired_or_used' })
  })

  it('aceita o código até um milissegundo antes de vencer', () => {
    const token = storedToken({ expiresAt: new Date(NOW.getTime() + 1) })

    expect(checkToken(token, '123456', NOW, 5).result).toBe('valid')
  })

  it('é de uso único: um token já usado não vale mais', () => {
    const token = storedToken({ usedAt: new Date(NOW.getTime() - 1000) })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({
      result: 'expired_or_used',
    })
  })

  it('recusa um token que outro mais novo substituiu', () => {
    const token = storedToken({ invalidatedAt: new Date(NOW.getTime() - 1000) })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({
      result: 'expired_or_used',
    })
  })

  it('conta um código errado e diz quantas tentativas restam', () => {
    expect(checkToken(storedToken(), '000000', NOW, 5)).toEqual({
      result: 'wrong_code',
      attemptsLeft: 4,
    })
    expect(checkToken(storedToken({ attempts: 3 }), '000000', NOW, 5)).toEqual({
      result: 'wrong_code',
      attemptsLeft: 1,
    })
  })

  it('não deixa tentativas depois do quinto código errado', () => {
    expect(checkToken(storedToken({ attempts: 4 }), '000000', NOW, 5)).toEqual({
      result: 'wrong_code',
      attemptsLeft: 0,
    })
  })

  it('bloqueia o token no limite de tentativas, até para o código certo', () => {
    const token = storedToken({ attempts: 5 })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({ result: 'locked' })
    expect(checkToken(token, '000000', NOW, 5)).toEqual({ result: 'locked' })
  })

  it('usa o limite que recebe', () => {
    expect(
      checkToken(storedToken({ attempts: 3 }), '123456', NOW, 3).result,
    ).toBe('locked')
  })
})

describe('espera entre envios (resendWaitSeconds)', () => {
  it('deixa o primeiro token sair na hora', () => {
    expect(resendWaitSeconds(undefined, NOW)).toBe(0)
  })

  it('faz um segundo pedido esperar o resto dos 60 segundos', () => {
    const sentAt = new Date(NOW.getTime() - 18_000)

    expect(resendWaitSeconds(sentAt, NOW)).toBe(42)
    expect(resendWaitSeconds(NOW, NOW)).toBe(RESEND_COOLDOWN_SECONDS)
  })

  it('arredonda para cima, para nunca dizer 0 enquanto a espera não acabou', () => {
    const sentAt = new Date(NOW.getTime() - 59_500)

    expect(resendWaitSeconds(sentAt, NOW)).toBe(1)
  })

  it('libera um novo token depois de 60 segundos', () => {
    expect(resendWaitSeconds(new Date(NOW.getTime() - 60_000), NOW)).toBe(0)
    expect(resendWaitSeconds(new Date(NOW.getTime() - 3_600_000), NOW)).toBe(0)
  })
})
