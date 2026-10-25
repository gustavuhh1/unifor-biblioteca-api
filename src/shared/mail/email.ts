import { Resend } from 'resend'
import { env } from '../../config/env.js'

// Envio de e-mail pelo Resend, usado pelo token do cadastro (módulo auth) e pelos
// avisos (módulo notifications). Quem chama decide o que fazer com cada resultado.

// Como o e-mail sai. Com chave, pelo Resend. Sem chave, só quando a API conversa
// com os emuladores o e-mail "sai" no console do servidor, para ninguém ler o
// conteúdo num log do projeto real.
export type MailMode = 'resend' | 'console' | 'unavailable'

export function mailMode(config: {
  RESEND_API_KEY?: string | undefined
  FIRESTORE_EMULATOR_HOST?: string | undefined
}): MailMode {
  if (config.RESEND_API_KEY) return 'resend'
  return config.FIRESTORE_EMULATOR_HOST ? 'console' : 'unavailable'
}

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

// O que aconteceu com o envio: `sent` (o Resend aceitou), `console` (desenvolvimento
// no emulador, nada saiu), `unavailable` (sem RESEND_API_KEY ou EMAIL_FROM) ou
// `failed` (o Resend recusou). Nunca lança erro.
export type EmailResult = 'sent' | 'console' | 'unavailable' | 'failed'

// Envia o e-mail pelo Resend.
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const mode = mailMode(env)
  if (mode === 'console') return 'console'
  if (mode === 'unavailable' || !env.EMAIL_FROM) return 'unavailable'

  const resend = new Resend(env.RESEND_API_KEY)
  try {
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      ...message,
    })
    if (error) {
      // O erro não traz o conteúdo da mensagem, mas só o nome vai para o log.
      console.error('O Resend não conseguiu enviar o e-mail:', error.name)
      return 'failed'
    }
    return 'sent'
  } catch (error) {
    console.error(
      'O Resend não respondeu:',
      error instanceof Error ? error.name : 'erro desconhecido',
    )
    return 'failed'
  }
}
