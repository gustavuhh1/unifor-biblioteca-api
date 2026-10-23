import { z } from 'zod'
import { LOAN_STATUSES } from '../../../shared/types/index.js'
import {
  LOAN_DISPLAY_STATES,
  LOAN_VIEWS,
  RENEWAL_DENIAL_REASONS,
} from '../loans.constants.js'

// Schemas de saída do módulo de empréstimos. Também alimentam o Swagger. Data vai
// em ISO 8601 (UTC); campo que o pedido ainda não tem vai como null.

const isoDate = z.iso.datetime()

// Um pedido ou empréstimo do aluno, com o estado calculado na hora (RF-EMP-08,
// RF-SIS-03). É a resposta de pedir, cancelar e renovar, e o item de Meus
// empréstimos.
export const loanSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    bookTitle: z.string(),
    bookShelf: z.string(),
    status: z.enum(LOAN_STATUSES).meta({
      description: 'O estado gravado do pedido.',
    }),
    state: z.enum(LOAN_DISPLAY_STATES).meta({
      description:
        'O que o app mostra, calculado na hora: `ready_for_pickup` (Pronto para retirar), `in_progress` (Em andamento), `due_soon` (Vence em breve: faltam até `dueSoonDays` dias), `overdue` (Atrasado) ou o estado final (`returned`, `expired`, `cancelled`).',
    }),
    requestedAt: isoDate,
    pickupDeadline: isoDate.meta({
      description: 'Último instante para retirar, no fechamento da biblioteca.',
    }),
    pickupCode: z.string().nullable().meta({
      description:
        'Código curto "RET-4821", digitado no balcão. Só vem enquanto `status` é `awaiting_pickup`.',
    }),
    qrToken: z.string().nullable().meta({
      description:
        'Segredo do QR da retirada (RF-EMP-07). Só vem enquanto `status` é `awaiting_pickup`. O app o guarda para mostrar o QR sem internet.',
    }),
    pickedUpAt: isoDate.nullable(),
    dueAt: isoDate.nullable().meta({
      description:
        'Vencimento, no fechamento da biblioteca. Vem depois da retirada.',
    }),
    originalDueAt: isoDate.nullable().meta({
      description: 'Vencimento antes da renovação.',
    }),
    renewalCount: z.number().int(),
    canRenew: z.boolean().meta({
      description:
        '`true` só para empréstimo ativo que pode ser renovado agora (RF-EMP-09).',
    }),
    renewalDenialReason: z.enum(RENEWAL_DENIAL_REASONS).nullable().meta({
      description:
        'Por que a renovação seria negada (RF-EMP-10). `null` quando pode renovar ou quando o item não é um empréstimo ativo.',
    }),
    progress: z.number().min(0).max(1).nullable().meta({
      description:
        'Quanto do prazo já passou, de 0 a 1: do pedido até `pickupDeadline` (pedido para retirar) ou da retirada até `dueAt` (empréstimo ativo). `null` nos itens do histórico.',
    }),
    returnedAt: isoDate.nullable(),
    cancelledAt: isoDate.nullable(),
    expiredAt: isoDate.nullable(),
  })
  .meta({ id: 'Loan' })

// Resposta de GET /me/loans: a aba pedida e os itens, dos mais novos para os mais
// antigos.
export const myLoansResponseSchema = z
  .object({
    view: z.enum(LOAN_VIEWS),
    items: z.array(loanSchema),
  })
  .meta({ id: 'MyLoansResponse' })
