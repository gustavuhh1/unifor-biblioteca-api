import { Resend } from 'resend'
import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors.js'
import type { TokenPurpose } from './email-token.js'

export type MailMode = 'resend' | 'console' | 'unavailable'

// With a key the e-mail goes through Resend. Without one, only when talking to
// the emulators the token is written to the server console, so nobody can
// read it in a log of the real project.
export function mailMode(config: {
  RESEND_API_KEY?: string | undefined
  FIRESTORE_EMULATOR_HOST?: string | undefined
}): MailMode {
  if (config.RESEND_API_KEY) return 'resend'
  return config.FIRESTORE_EMULATOR_HOST ? 'console' : 'unavailable'
}

const SUBJECTS: Record<TokenPurpose, string> = {
  email_confirmation: 'Confirme seu e-mail na Unifor Biblioteca',
  password_reset: 'Recupere sua senha da Unifor Biblioteca',
}

const INTROS: Record<TokenPurpose, string> = {
  email_confirmation: 'Use o token abaixo para confirmar seu e-mail no app.',
  password_reset: 'Use o token abaixo para criar uma nova senha no app.',
}

export function buildTokenEmail(
  purpose: TokenPurpose,
  code: string,
  ttlMinutes: number,
) {
  const validity = `O token vale por ${ttlMinutes} minutos e só pode ser usado uma vez.`
  const ignore = 'Se você não pediu isso, ignore esta mensagem.'
  return {
    subject: SUBJECTS[purpose],
    text: `${INTROS[purpose]}\n\n${code}\n\n${validity}\n${ignore}`,
    html:
      `<p>${INTROS[purpose]}</p>` +
      `<p style="font-size:32px;letter-spacing:6px;font-weight:bold">${code}</p>` +
      `<p>${validity}</p><p>${ignore}</p>`,
  }
}

export async function sendTokenEmail(input: {
  to: string
  purpose: TokenPurpose
  code: string
  ttlMinutes: number
}): Promise<void> {
  const mode = mailMode(env)

  if (mode === 'console') {
    console.log(
      [
        '',
        '========== SÓ PARA DESENVOLVIMENTO (RESEND_API_KEY não definida) ==========',
        `E-mail NÃO enviado. Token de ${input.purpose} para ${input.to}: ${input.code}`,
        '===========================================================================',
        '',
      ].join('\n'),
    )
    return
  }

  if (mode === 'unavailable' || !env.EMAIL_FROM) {
    console.error('E-mail not configured: set RESEND_API_KEY and EMAIL_FROM.')
    throw new AppError(
      500,
      'email_not_configured',
      'O envio de e-mail não está configurado.',
    )
  }

  const { subject, text, html } = buildTokenEmail(
    input.purpose,
    input.code,
    input.ttlMinutes,
  )
  const resend = new Resend(env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject,
    text,
    html,
  })
  if (error) {
    // The error never carries the token, but log only its name anyway.
    console.error('Resend failed to send an e-mail:', error.name)
    throw new AppError(
      502,
      'email_delivery_failed',
      'Não foi possível enviar o e-mail agora. Tente novamente em instantes.',
    )
  }
}
