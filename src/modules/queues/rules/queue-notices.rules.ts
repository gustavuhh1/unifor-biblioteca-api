import { formatLocalDateTime } from '../../../shared/calendar/dates.js'
import {
  NOTIFICATION_ACTION,
  NOTIFICATION_TYPE,
  type NotificationAction,
  type NotificationType,
  type QueueEntryRecord,
  type UserNotification,
} from '../../../shared/types/index.js'
import { newNotice } from '../../notifications/rules/notice.rules.js'

// Avisos dentro do app que a fila gera (seção 2.14): sua vez, vez perdida,
// posição mudada, entrada e saída feitas pelo bibliotecário e fila cancelada por
// outra edição. Funções puras: devolvem o documento users/{uid}/notifications. O
// envio por push e por e-mail (RF-AVI-02) é do módulo de avisos.

type QueueNoticeEntry = Pick<
  QueueEntryRecord,
  'id' | 'bookId' | 'bookTitle' | 'confirmDeadline'
>

// Monta o aviso: texto, ligação com a fila e o livro, e o botão (se houver).
function notice(
  type: NotificationType,
  entry: QueueNoticeEntry,
  text: { title: string; body: string },
  action: NotificationAction,
  at: Date,
): UserNotification {
  return newNotice(
    {
      type,
      ...text,
      bookId: entry.bookId,
      queueEntryId: entry.id,
      action,
    },
    at,
  )
}

// "É a sua vez" (RF-FIL-06): o exemplar voltou e o aluno tem até o prazo para
// confirmar. Também é o aviso reenviado pelo bibliotecário (RF-BAL-06).
export function turnNotice(
  entry: QueueNoticeEntry & { confirmDeadline: Date },
  at: Date,
): UserNotification {
  return notice(
    NOTIFICATION_TYPE.queueTurn,
    entry,
    {
      title: `É a sua vez: ${entry.bookTitle}`,
      body: `Confirme até ${formatLocalDateTime(entry.confirmDeadline)} que vai retirar.`,
    },
    NOTIFICATION_ACTION.confirmTurn,
    at,
  )
}

// "Você perdeu a vez" (RF-FIL-07): passou o prazo de confirmar e o aluno saiu da
// fila.
export function turnMissedNotice(
  entry: QueueNoticeEntry,
  at: Date,
): UserNotification {
  return notice(
    NOTIFICATION_TYPE.queueTurnMissed,
    entry,
    {
      title: `Você perdeu a vez: ${entry.bookTitle}`,
      body: 'O prazo para confirmar acabou e você saiu da fila. Entre na fila de novo se ainda quiser o livro.',
    },
    NOTIFICATION_ACTION.none,
    at,
  )
}

// A fila desta edição foi cancelada porque outra edição do mesmo livro chegou
// primeiro (RF-FIL-04).
export function otherEditionNotice(
  entry: QueueNoticeEntry,
  at: Date,
): UserNotification {
  return notice(
    NOTIFICATION_TYPE.queueCancelledOtherEdition,
    entry,
    {
      title: `Fila cancelada: ${entry.bookTitle}`,
      body: 'Outra edição do mesmo livro chegou primeiro, então esta fila foi cancelada.',
    },
    NOTIFICATION_ACTION.none,
    at,
  )
}

// O bibliotecário mudou a posição (RF-BAL-06, RF-BAL-07): vale para quem foi
// movido e para quem desceu.
export function positionChangedNotice(
  entry: QueueNoticeEntry,
  position: number,
  at: Date,
): UserNotification {
  return notice(
    NOTIFICATION_TYPE.queuePositionChanged,
    entry,
    {
      title: `Sua posição na fila mudou: ${entry.bookTitle}`,
      body: `O balcão da biblioteca mudou a fila. Agora você é o ${position}º.`,
    },
    NOTIFICATION_ACTION.none,
    at,
  )
}

// O bibliotecário colocou o aluno na fila (RF-BAL-06).
export function addedByLibrarianNotice(
  entry: QueueNoticeEntry,
  position: number,
  at: Date,
): UserNotification {
  return notice(
    NOTIFICATION_TYPE.queueAddedByLibrarian,
    entry,
    {
      title: `Você entrou na fila: ${entry.bookTitle}`,
      body: `O balcão da biblioteca colocou você na fila, na posição ${position}.`,
    },
    NOTIFICATION_ACTION.none,
    at,
  )
}

// O bibliotecário tirou o aluno da fila, com o motivo (RF-BAL-06).
export function removedByLibrarianNotice(
  entry: QueueNoticeEntry,
  reason: string,
  at: Date,
): UserNotification {
  return notice(
    NOTIFICATION_TYPE.queueRemovedByLibrarian,
    entry,
    {
      title: `Você saiu da fila: ${entry.bookTitle}`,
      body: `O balcão da biblioteca tirou você da fila. Motivo: ${reason}`,
    },
    NOTIFICATION_ACTION.none,
    at,
  )
}
