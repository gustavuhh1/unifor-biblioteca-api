import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import {
  ACTIVE_QUEUE_STATUSES,
  BLOCKED_REASONS,
  QUEUE_ENTRY_STATUSES,
  QUEUE_ORIGINS,
} from '../../../shared/types/index.js'
import { loanSchema } from '../../loans/schemas/response.schemas.js'

// Schemas de saída do módulo de filas. Também alimentam o Swagger. Data vai em
// ISO 8601 (UTC); campo que o lugar ainda não tem vai como null. A posição e as
// pessoas na frente são calculadas na hora, nunca gravadas.

const nullableText = z.string().nullable()

// --- Aluno ---------------------------------------------------------------------

// Um lugar do aluno numa fila ativa (RF-FIL-08).
export const queueEntrySchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    bookTitle: z.string(),
    status: z.enum(ACTIVE_QUEUE_STATUSES).meta({
      description:
        '`waiting` (Na fila) ou `your_turn` (É a sua vez: confirme até `confirmDeadline`).',
    }),
    position: z.number().int().min(1).meta({
      description: 'Posição na fila da edição, de 1 (a frente) em diante.',
    }),
    peopleAhead: z.number().int().min(0).meta({
      description: 'Pessoas na frente: `position - 1`.',
    }),
    joinedAt: isoDate,
    confirmDeadline: isoDate.nullable().meta({
      description:
        'Só em `your_turn`: o aluno tem até este instante (24h corridas) para confirmar.',
    }),
    editionGroupId: nullableText.meta({
      description:
        'Igual nas edições marcadas juntas (RF-FIL-04). Quando uma delas é confirmada, as outras são canceladas.',
    }),
  })
  .meta({ id: 'QueueEntry' })

// Uma edição do livro na prévia da fila (RF-FIL-01, RF-FIL-04).
export const queuePreviewEditionSchema = z
  .object({
    bookId: z.string(),
    title: z.string(),
    edition: nullableText,
    year: z.number().int().nullable(),
    copiesAvailable: z.number().int(),
    peopleAhead: z.number().int().min(0).meta({
      description:
        'Quantas pessoas estariam na frente: os lugares `waiting` e `your_turn` da edição.',
    }),
    alreadyInQueue: z.boolean().meta({
      description: 'O aluno já tem lugar ativo na fila desta edição.',
    }),
    canJoin: z.boolean(),
    blockedReason: z.enum(BLOCKED_REASONS).nullable().meta({
      description:
        'Por que o aluno não pode entrar nesta edição. `null` quando pode, e também quando o motivo é `alreadyInQueue`.',
    }),
  })
  .meta({ id: 'QueuePreviewEdition' })

// Prévia da fila: as edições do livro com as pessoas na frente de cada uma.
export const queuePreviewSchema = z
  .object({
    bookId: z.string(),
    activeQueueCount: z.number().int().meta({
      description: 'Filas ativas do aluno (cada edição conta 1).',
    }),
    maxActiveQueues: z.number().int(),
    editions: z.array(queuePreviewEditionSchema).meta({
      description:
        'A edição pedida e as outras edições ativas do mesmo livro, para o aluno marcar uma ou mais.',
    }),
  })
  .meta({ id: 'QueuePreview' })

// Resposta de POST /queues: os lugares criados, um por edição marcada.
export const joinQueueResponseSchema = z
  .object({ items: z.array(queueEntrySchema) })
  .meta({ id: 'JoinQueueResponse' })

// Resposta de GET /me/queues (RF-FIL-08).
export const myQueuesResponseSchema = z
  .object({
    items: z.array(queueEntrySchema),
    activeQueueCount: z.number().int(),
    maxActiveQueues: z.number().int(),
  })
  .meta({ id: 'MyQueuesResponse' })

// Lugar que saiu da fila ativa (resposta de sair).
export const endedQueueEntrySchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    bookTitle: z.string(),
    status: z.enum(QUEUE_ENTRY_STATUSES),
    endedAt: isoDate,
  })
  .meta({ id: 'EndedQueueEntry' })

// Resposta de confirmar a vez (RF-FIL-06): o pedido criado e os lugares das
// outras edições que foram cancelados (RF-FIL-04).
export const confirmTurnResponseSchema = z
  .object({
    loan: loanSchema,
    cancelledEntryIds: z.array(z.string()),
  })
  .meta({ id: 'ConfirmTurnResponse' })

// --- Bibliotecário -------------------------------------------------------------

// Um lugar na fila de um livro, como o bibliotecário vê (RF-BAL-06).
export const librarianQueueEntrySchema = z
  .object({
    id: z.string(),
    position: z.number().int().min(1),
    status: z.enum(ACTIVE_QUEUE_STATUSES),
    studentUid: z.string(),
    studentName: z.string(),
    matricula: z.string(),
    joinedAt: isoDate,
    origin: z.enum(QUEUE_ORIGINS),
    addReason: nullableText,
    confirmDeadline: isoDate.nullable(),
    lastNotifiedAt: isoDate.nullable(),
    notifyCount: z.number().int(),
    editionGroupId: nullableText,
  })
  .meta({ id: 'LibrarianQueueEntry' })

// A fila de um livro (edição) com a ordem real (RF-BAL-06).
export const librarianQueueSchema = z
  .object({
    book: z.object({
      id: z.string(),
      title: z.string(),
      edition: nullableText,
      year: z.number().int().nullable(),
      copiesTotal: z.number().int(),
      copiesAvailable: z.number().int(),
    }),
    items: z.array(librarianQueueEntrySchema),
  })
  .meta({ id: 'LibrarianQueue' })

// Quem desce uma posição quando alguém passa à frente (RF-BAL-07).
export const queueMovedDownSchema = z
  .object({
    entryId: z.string(),
    studentName: z.string(),
    matricula: z.string(),
    fromPosition: z.number().int(),
    toPosition: z.number().int(),
  })
  .meta({ id: 'QueueMovedDown' })

// Resposta de adicionar à fila e de mover (RF-BAL-06, RF-BAL-07).
export const queueChangeResponseSchema = z
  .object({
    applied: z.boolean().meta({
      description:
        '`false`: a mudança passa à frente de alguém e ainda não foi confirmada; nada foi gravado. Mostre `movedDown` na confirmação e envie de novo com `confirmed: true` e o `reason`.',
    }),
    movedDown: z.array(queueMovedDownSchema).meta({
      description: 'Os alunos que descem uma posição (vazio se ninguém desce).',
    }),
    queue: librarianQueueSchema.nullable().meta({
      description: 'A fila já com a mudança. `null` quando `applied` é false.',
    }),
  })
  .meta({ id: 'QueueChangeResponse' })
