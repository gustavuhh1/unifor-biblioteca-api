import {
  DELIVERY_STATUS,
  type NotificationAction,
  type NotificationType,
  type UserNotification,
} from '../../../shared/types/index.js'

// Como todo aviso dentro do app nasce (seção 2.14). Os avisos da fila, dos
// empréstimos e das multas montam o documento por aqui.

export interface NoticeInput {
  type: NotificationType
  title: string
  body: string
  action: NotificationAction
  // Com o que o aviso se liga (o app abre a tela certa).
  bookId?: string
  loanId?: string
  queueEntryId?: string
  fineId?: string
}

// O documento de um aviso novo. Os dois canais de fora nascem `skipped`
// ("ainda não entregue"); a entrega por push e e-mail troca pelo resultado
// (RF-AVI-02), e o aviso dentro do app aparece de qualquer jeito (RNF-CON-02).
export function newNotice(input: NoticeInput, at: Date): UserNotification {
  return {
    ...input,
    delivery: {
      push: DELIVERY_STATUS.skipped,
      email: DELIVERY_STATUS.skipped,
    },
    createdAt: at,
    updatedAt: at,
  }
}
