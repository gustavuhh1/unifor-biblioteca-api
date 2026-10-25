import { describe, expect, it } from 'vitest'
import { buildTokenEmail } from '../mail/mailer.js'

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
