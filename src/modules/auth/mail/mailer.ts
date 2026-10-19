import { Resend } from 'resend'
import { env } from '../../../config/env.js'
import {
  EMAIL_TOKEN_PURPOSE,
  type EmailTokenPurpose,
} from '../../../shared/types/index.js'
import { emailDeliveryFailed, emailNotConfigured } from '../auth.errors.js'
import type { MailMode } from '../auth.types.js'

// Decide como o token chega ao aluno. Com chave, o e-mail sai pelo Resend. Sem
// chave, só quando a API conversa com os emuladores o token é escrito no
// console do servidor, para ninguém ler o token num log do projeto real.
export function mailMode(config: {
  RESEND_API_KEY?: string | undefined
  FIRESTORE_EMULATOR_HOST?: string | undefined
}): MailMode {
  if (config.RESEND_API_KEY) return 'resend'
  return config.FIRESTORE_EMULATOR_HOST ? 'console' : 'unavailable'
}

const SUBJECTS: Record<EmailTokenPurpose, string> = {
  [EMAIL_TOKEN_PURPOSE.emailConfirmation]:
    'Confirme seu e-mail na Unifor Biblioteca',
  [EMAIL_TOKEN_PURPOSE.passwordReset]:
    'Recupere sua senha da Unifor Biblioteca',
}

const INTROS: Record<EmailTokenPurpose, string> = {
  [EMAIL_TOKEN_PURPOSE.emailConfirmation]:
    'Use o token abaixo para confirmar seu e-mail no app.',
  [EMAIL_TOKEN_PURPOSE.passwordReset]:
    'Use o token abaixo para criar uma nova senha no app.',
}

// Monta o assunto, o texto e o HTML do e-mail do token (RF-AUT-03).
export function buildTokenEmail(
  purpose: EmailTokenPurpose,
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

// Envia o token ao e-mail real do aluno pelo Resend. No emulador, sem chave,
// escreve o token no console do servidor (só para desenvolvimento). Falha com
// 502 se o Resend recusar e com 500 se o envio não estiver configurado.
export async function sendTokenEmail(input: {
  to: string
  purpose: EmailTokenPurpose
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
    console.error(
      'E-mail sem configuração: defina RESEND_API_KEY e EMAIL_FROM.',
    )
    throw emailNotConfigured()
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
    // O erro não traz o token, mas só o nome vai para o log.
    console.error('O Resend não conseguiu enviar o e-mail:', error.name)
    throw emailDeliveryFailed()
  }
}
