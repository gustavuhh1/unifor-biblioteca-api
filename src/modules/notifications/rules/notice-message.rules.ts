import type { EmailMessage } from '../../../shared/mail/email.js'
import type { NotificationRecord } from '../../../shared/types/index.js'
import type { PushMessage } from '../push/expo-push.client.js'

// O texto do aviso nos canais de fora do app (RF-AVI-02). Funções puras.

const EMAIL_FOOTER =
  'Abra o app Unifor Biblioteca para ver o aviso. Para escolher quais avisos receber, use Perfil > Avisos e lembretes.'

// Troca os caracteres que o HTML trata como marcação (o título do livro vem do
// acervo e pode ter & ou <).
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// A mensagem de push de um aviso, com os ids que o app usa para abrir a tela certa.
export function pushMessageOf(
  notice: NotificationRecord,
  token: string,
): PushMessage {
  const data: Record<string, string> = {
    notificationId: notice.id,
    type: notice.type,
    action: notice.action,
  }
  if (notice.bookId) data.bookId = notice.bookId
  if (notice.loanId) data.loanId = notice.loanId
  if (notice.queueEntryId) data.queueEntryId = notice.queueEntryId
  if (notice.fineId) data.fineId = notice.fineId
  return { to: token, title: notice.title, body: notice.body, data }
}

// O e-mail de um aviso: o título é o assunto.
export function emailMessageOf(
  notice: NotificationRecord,
  to: string,
): EmailMessage {
  return {
    to,
    subject: notice.title,
    text: `${notice.body}\n\n${EMAIL_FOOTER}`,
    html:
      `<p><strong>${escapeHtml(notice.title)}</strong></p>` +
      `<p>${escapeHtml(notice.body)}</p>` +
      `<p>${EMAIL_FOOTER}</p>`,
  }
}
