import { describe, expect, it } from 'vitest'
import { buildTokenEmail, mailMode } from './mailer.js'

describe('mailMode', () => {
  it('sends through Resend when there is a key', () => {
    expect(mailMode({ RESEND_API_KEY: 'key' })).toBe('resend')
    expect(
      mailMode({
        RESEND_API_KEY: 'key',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
      }),
    ).toBe('resend')
  })

  it('writes the token to the console only on the emulator without a key', () => {
    expect(mailMode({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' })).toBe(
      'console',
    )
  })

  it('does not send nor print anything against the real project without a key', () => {
    expect(mailMode({})).toBe('unavailable')
  })
})

describe('buildTokenEmail', () => {
  it('has the token, the validity and a subject for each purpose', () => {
    const confirmation = buildTokenEmail('email_confirmation', '482913', 20)
    const reset = buildTokenEmail('password_reset', '482913', 20)

    expect(confirmation.subject).toMatch(/Confirme/)
    expect(reset.subject).toMatch(/senha/)
    for (const email of [confirmation, reset]) {
      expect(email.text).toContain('482913')
      expect(email.html).toContain('482913')
      expect(email.text).toContain('20 minutos')
    }
  })
})
