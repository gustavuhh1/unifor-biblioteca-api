import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import { FINE_STATUSES } from '../../../shared/types/index.js'

// Schemas de saída do módulo de multas. Também alimentam o Swagger. Data vai em
// ISO 8601 (UTC); campo que a multa ainda não tem vai como null. Dinheiro vai
// sempre em centavos (inteiro).

// Uma multa (RF-MUL-03). Na multa `accruing` os dias e o valor são calculados na
// hora; nas outras, são os valores congelados na devolução.
export const fineSchema = z
  .object({
    id: z.string(),
    loanId: z.string(),
    bookId: z.string(),
    bookTitle: z.string(),
    status: z.enum(FINE_STATUSES).meta({
      description:
        '`accruing` (Contando: livro ainda não devolvido), `open` (Em aberto: devolvido, falta pagar no balcão) ou `paid` (Paga).',
    }),
    dueAt: isoDate.meta({ description: 'O vencimento do empréstimo.' }),
    businessDaysLate: z.number().int().min(0).meta({
      description:
        'Dias úteis de atraso. Fim de semana, feriado e recesso não contam.',
    }),
    ratePerBusinessDayCents: z.number().int(),
    amountCents: z.number().int().min(0).meta({
      description: '`businessDaysLate` × `ratePerBusinessDayCents`.',
    }),
    frozenAt: isoDate.nullable().meta({
      description: 'A devolução, quando a multa parou de contar.',
    }),
    paidAt: isoDate.nullable(),
    receivedByName: z.string().nullable().meta({
      description: 'Quem recebeu o pagamento no balcão.',
    }),
  })
  .meta({ id: 'Fine' })

// Resposta de GET /me/fines (RF-MUL-03, RF-MUL-04).
export const myFinesResponseSchema = z
  .object({
    items: z.array(fineSchema),
    openTotalCents: z.number().int().min(0).meta({
      description:
        'Soma das multas `open`. É o aviso "você tem R$ X em aberto"; o pagamento é só no balcão.',
    }),
    blocksNewLoans: z.boolean().meta({
      description:
        '`true` só quando o aluno tem empréstimo atrasado (RF-EMP-04). Multa em aberto sem atraso só avisa e não bloqueia (RF-MUL-04).',
    }),
  })
  .meta({ id: 'MyFinesResponse' })

// Uma multa na aba Multas do bibliotecário (RF-BAL-09).
export const librarianFineSchema = fineSchema
  .extend({
    studentName: z.string(),
    matricula: z.string(),
    paidAtReturn: z.boolean().meta({
      description: '`true` quando foi paga na devolução ("Multa paga agora").',
    }),
  })
  .meta({ id: 'LibrarianFine' })

// Resposta de GET /librarian/fines.
export const librarianFinesResponseSchema = z
  .object({
    status: z.enum(FINE_STATUSES),
    items: z.array(librarianFineSchema).meta({
      description:
        'Em aberto: as mais recentes primeiro (devolução). Contando: as de vencimento mais antigo primeiro. Pagas: as mais recentes primeiro.',
    }),
  })
  .meta({ id: 'LibrarianFinesResponse' })
