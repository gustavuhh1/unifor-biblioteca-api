import {
  EMAIL_TOKEN_PURPOSE,
  type EmailTokenPurpose,
} from '../../../shared/types/index.js'
import { sendEmail } from '../../../shared/mail/email.js'
import { emailDeliveryFailed, emailNotConfigured } from '../auth.errors.js'

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
  const result = await sendEmail({
    to: input.to,
    ...buildTokenEmail(input.purpose, input.code, input.ttlMinutes),
  })

  if (result === 'console') {
    console.log(
      [
        '',
        '========== SÓ PARA DESENVOLVIMENTO (RESEND_API_KEY não definida) ==========',
        `E-mail NÃO enviado. Token de ${input.purpose} para ${input.to}: ${input.code}`,
        '===========================================================================',
        '',
      ].join('\n'),
    )
  } else if (result === 'unavailable') {
    console.error(
      'E-mail sem configuração: defina RESEND_API_KEY e EMAIL_FROM.',
    )
    throw emailNotConfigured()
  } else if (result === 'failed') {
    throw emailDeliveryFailed()
  }
}
