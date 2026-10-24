import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import { BLOCKED_REASON, FINE_STATUSES } from '../../../shared/types/index.js'
import { loanSchema } from '../../loans/schemas/response.schemas.js'

// Schemas de saída do módulo do balcão. Também alimentam o Swagger. Data vai em
// ISO 8601 (UTC); campo que ainda não existe vai como null. Dinheiro vai sempre em
// centavos. Nenhuma resposta traz o qrToken: o segredo só vai do app do aluno ao
// leitor do balcão.

// Um pedido ou empréstimo na ficha do balcão: os campos de loanSchema que o
// balcão usa. O código curto só vem enquanto o pedido espera a retirada.
export const deskLoanSchema = loanSchema
  .pick({
    id: true,
    bookId: true,
    bookTitle: true,
    bookShelf: true,
    status: true,
    state: true,
    pickupCode: true,
    pickupDeadline: true,
    pickedUpAt: true,
    dueAt: true,
    returnedAt: true,
    progress: true,
  })
  .meta({ id: 'DeskLoan' })

// A multa que um empréstimo atrasado já acumulou, calculada na hora.
export const deskFinePreviewSchema = z
  .object({
    businessDaysLate: z.number().int().min(1).meta({
      description:
        'Dias úteis de atraso até agora. Fim de semana, feriado e recesso não contam.',
    }),
    amountCents: z.number().int().min(0),
  })
  .meta({ id: 'DeskFinePreview' })

// O aluno da ficha (RF-BAL-02).
export const deskStudentSchema = z
  .object({
    uid: z.string(),
    matricula: z.string(),
    name: z.string().meta({
      description: 'O nome do Perfil ou, sem ele, a matrícula.',
    }),
    initials: z.string().nullable().meta({
      description: 'Iniciais do avatar. `null` enquanto o aluno não tem nome.',
    }),
    activeLoanCount: z.number().int().min(0).meta({
      description: 'Pedidos para retirar mais empréstimos ativos ("3 de 10").',
    }),
    maxActiveLoans: z.number().int(),
    openFineTotalCents: z.number().int().min(0).meta({
      description: 'Soma das multas em aberto (já devolvidas, falta pagar).',
    }),
  })
  .meta({ id: 'DeskStudent' })

// Resposta de POST /librarian/desk/lookup: a ficha do aluno (RF-BAL-02,
// RF-BAL-03).
export const deskLookupResponseSchema = z
  .object({
    student: deskStudentSchema,
    pickups: z
      .array(
        deskLoanSchema.extend({
          scanned: z.boolean().meta({
            description:
              '`true` no pedido que o QR ou o código apontou. Na busca por matrícula, nenhum.',
          }),
        }),
      )
      .meta({
        description:
          'Os pedidos do aluno aguardando retirada, do prazo mais curto ao mais longo.',
      }),
    withStudent: z
      .array(
        deskLoanSchema.extend({
          fine: deskFinePreviewSchema.nullable().meta({
            description:
              'A multa que o empréstimo atrasado já acumulou. `null` se não está atrasado ou ainda não passou um dia útil.',
          }),
        }),
      )
      .meta({
        description:
          'Os livros que estão com o aluno (empréstimos ativos), do vencimento mais próximo ao mais distante. Tocar em um abre a devolução.',
      }),
    blockedReason: z.literal(BLOCKED_REASON.overdue).nullable().meta({
      description:
        '`overdue` quando o aluno tem livro atrasado: a retirada é recusada até ele devolver (RF-EMP-04). `null` caso contrário.',
    }),
  })
  .meta({ id: 'DeskLookupResponse' })

// Resposta de POST /librarian/loans/:loanId/pickup (RF-BAL-02).
export const pickupResponseSchema = z
  .object({ loan: deskLoanSchema })
  .meta({ id: 'PickupResponse' })

// A multa depois de congelar, como a devolução a mostra.
export const returnedFineSchema = z
  .object({
    id: z.string(),
    status: z.enum(FINE_STATUSES).meta({
      description:
        '`open` (falta pagar no balcão) ou `paid` (paga na hora, com "Multa paga agora").',
    }),
    businessDaysLate: z.number().int().min(0),
    amountCents: z.number().int().min(0),
  })
  .meta({ id: 'ReturnedFine' })

// Resposta de POST /librarian/loans/:loanId/return (RF-BAL-04, RF-BAL-08).
export const returnResponseSchema = z
  .object({
    loan: deskLoanSchema,
    fine: returnedFineSchema.nullable().meta({
      description: 'A multa congelada. `null` se a devolução não gerou multa.',
    }),
    queueNotified: z.boolean().meta({
      description:
        '`true` se o livro tinha fila: o 1º foi avisado na hora e ficou com o exemplar.',
    }),
  })
  .meta({ id: 'ReturnResponse' })

// Um pedido na lista Retiradas (RF-BAL-05).
export const pickupItemSchema = z
  .object({
    loanId: z.string(),
    pickupCode: z.string(),
    matricula: z.string(),
    studentName: z.string(),
    bookTitle: z.string(),
    bookShelf: z.string(),
    pickupDeadline: isoDate.meta({
      description: 'Último instante para retirar, no fechamento da biblioteca.',
    }),
  })
  .meta({ id: 'PickupItem' })

// Resposta de GET /librarian/pickups.
export const pickupsResponseSchema = z
  .object({
    items: z.array(pickupItemSchema).meta({
      description:
        'Pedidos aguardando retirada, do prazo mais curto ao mais longo.',
    }),
  })
  .meta({ id: 'PickupsResponse' })

// Resposta de GET /librarian/desk/summary: os números do dia no Painel
// (RF-BAL-01).
export const deskSummaryResponseSchema = z
  .object({
    pendingPickups: z.number().int().min(0).meta({
      description: 'Pedidos aguardando retirada.',
    }),
    returnsToday: z.number().int().min(0).meta({
      description: 'Devoluções registradas hoje (fuso de Fortaleza).',
    }),
    queueAwaitingConfirm: z.number().int().min(0).meta({
      description:
        'Lugares na fila que estão na vez e esperam o aluno confirmar (`your_turn`).',
    }),
    openFines: z.number().int().min(0).meta({
      description: 'Multas em aberto (livro devolvido, falta pagar).',
    }),
  })
  .meta({ id: 'DeskSummaryResponse' })
