import {
  DELIVERY_STATUS,
  type UserNotification,
} from '../../../shared/types/index.js'

type NoticeContent = Pick<
  UserNotification,
  'type' | 'title' | 'body' | 'action'
>

type NoticeRelations = Pick<
  UserNotification,
  'bookId' | 'loanId' | 'queueEntryId' | 'fineId'
>

// Campos comuns de todo aviso criado dentro da API. Push e e-mail começam como
// skipped; o módulo de entrega troca o estado quando processar os canais.
export function buildNotification(
  content: NoticeContent,
  relations: Partial<NoticeRelations>,
  at: Date,
): UserNotification {
  return {
    ...content,
    ...relations,
    delivery: {
      push: DELIVERY_STATUS.skipped,
      email: DELIVERY_STATUS.skipped,
    },
    createdAt: at,
    updatedAt: at,
  }
}
