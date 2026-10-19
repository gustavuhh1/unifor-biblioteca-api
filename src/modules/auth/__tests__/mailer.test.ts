import { describe, expect, it } from 'vitest'
import { buildTokenEmail, mailMode } from '../mail/mailer.js'

describe('modo de envio do e-mail (mailMode)', () => {
  it('envia pelo Resend quando há chave', () => {
    expect(mailMode({ RESEND_API_KEY: 'key' })).toBe('resend')
    expect(
      mailMode({
        RESEND_API_KEY: 'key',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
      }),
    ).toBe('resend')
  })

  it('escreve o token no console só no emulador e sem chave', () => {
    expect(mailMode({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081' })).toBe(
      'console',
    )
  })

  it('não envia nem imprime nada contra o projeto real sem chave', () => {
    expect(mailMode({})).toBe('unavailable')
  })
})

describe('texto do e-mail do token (buildTokenEmail)', () => {
  it('traz o token, a validade e um assunto para cada finalidade', () => {
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
