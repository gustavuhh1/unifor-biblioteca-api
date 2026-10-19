import { describe, expect, it } from 'vitest'
import {
  RESEND_COOLDOWN_SECONDS,
  checkToken,
  createTokenSecret,
  hashTokenCode,
  resendWaitSeconds,
  tokenExpiresAt,
  type StoredToken,
} from './email-token.js'

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

describe('createTokenSecret', () => {
  it('makes a six digit code, keeping leading zeros', () => {
    for (let i = 0; i < 200; i++) {
      expect(createTokenSecret().code).toMatch(/^\d{6}$/)
    }
  })

  it('hashes the code with its own salt and never keeps the code in the hash', () => {
    const first = createTokenSecret()
    const second = createTokenSecret()

    expect(first.codeHash).toBe(hashTokenCode(first.code, first.salt))
    expect(first.salt).not.toBe(second.salt)
    expect(first.codeHash).not.toContain(first.code)
    expect(first.codeHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gives the same code a different hash under another salt', () => {
    expect(hashTokenCode('123456', 'a')).not.toBe(hashTokenCode('123456', 'b'))
  })
})

describe('tokenExpiresAt', () => {
  it('adds the validity in minutes (20 by default in the model)', () => {
    expect(tokenExpiresAt(NOW, 20).toISOString()).toBe(
      '2026-10-19T12:20:00.000Z',
    )
  })
})

describe('checkToken', () => {
  it('accepts the right code of a token that is still valid', () => {
    expect(checkToken(storedToken(), '123456', NOW, 5)).toEqual({
      result: 'valid',
    })
  })

  it('refuses a token at and after the moment it expires', () => {
    const token = storedToken({ expiresAt: NOW })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({
      result: 'expired_or_used',
    })
    expect(
      checkToken(token, '123456', new Date(NOW.getTime() + 1000), 5),
    ).toEqual({ result: 'expired_or_used' })
  })

  it('accepts the code until one millisecond before it expires', () => {
    const token = storedToken({ expiresAt: new Date(NOW.getTime() + 1) })

    expect(checkToken(token, '123456', NOW, 5).result).toBe('valid')
  })

  it('is single use: a token that was used no longer works', () => {
    const token = storedToken({ usedAt: new Date(NOW.getTime() - 1000) })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({
      result: 'expired_or_used',
    })
  })

  it('refuses a token that a newer one replaced', () => {
    const token = storedToken({ invalidatedAt: new Date(NOW.getTime() - 1000) })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({
      result: 'expired_or_used',
    })
  })

  it('counts a wrong code and says how many attempts are left', () => {
    expect(checkToken(storedToken(), '000000', NOW, 5)).toEqual({
      result: 'wrong_code',
      attemptsLeft: 4,
    })
    expect(checkToken(storedToken({ attempts: 3 }), '000000', NOW, 5)).toEqual({
      result: 'wrong_code',
      attemptsLeft: 1,
    })
  })

  it('has no attempts left after the fifth wrong code', () => {
    expect(checkToken(storedToken({ attempts: 4 }), '000000', NOW, 5)).toEqual({
      result: 'wrong_code',
      attemptsLeft: 0,
    })
  })

  it('locks the token at the attempt limit, even for the right code', () => {
    const token = storedToken({ attempts: 5 })

    expect(checkToken(token, '123456', NOW, 5)).toEqual({ result: 'locked' })
    expect(checkToken(token, '000000', NOW, 5)).toEqual({ result: 'locked' })
  })

  it('uses the limit it is given', () => {
    expect(
      checkToken(storedToken({ attempts: 3 }), '123456', NOW, 3).result,
    ).toBe('locked')
  })
})

describe('resendWaitSeconds', () => {
  it('lets the first token go out right away', () => {
    expect(resendWaitSeconds(undefined, NOW)).toBe(0)
  })

  it('makes a second request wait the rest of the 60 seconds', () => {
    const sentAt = new Date(NOW.getTime() - 18_000)

    expect(resendWaitSeconds(sentAt, NOW)).toBe(42)
    expect(resendWaitSeconds(NOW, NOW)).toBe(RESEND_COOLDOWN_SECONDS)
  })

  it('rounds up, so it never says 0 while the wait is not over', () => {
    const sentAt = new Date(NOW.getTime() - 59_500)

    expect(resendWaitSeconds(sentAt, NOW)).toBe(1)
  })

  it('allows a new token after 60 seconds', () => {
    expect(resendWaitSeconds(new Date(NOW.getTime() - 60_000), NOW)).toBe(0)
    expect(resendWaitSeconds(new Date(NOW.getTime() - 3_600_000), NOW)).toBe(0)
  })
})
