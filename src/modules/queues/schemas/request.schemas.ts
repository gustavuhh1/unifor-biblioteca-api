import { z } from 'zod'
import { matriculaSchema } from '../../../shared/matricula.js'
import { bookParamsSchema } from '../../catalog/schemas/request.schemas.js'
import {
  MAX_EDITIONS_PER_JOIN,
  REASON_MAX_LENGTH,
} from '../queues.constants.js'

// Schemas de entrada do módulo de filas. As mensagens são em português.

// Texto em branco conta como "não informado".
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

// Motivo escrito pelo bibliotecário (RF-BAL-06, RF-BAL-07).
const reasonSchema = z
  .string('Informe o motivo.')
  .trim()
  .min(1, 'Informe o motivo.')
  .max(
    REASON_MAX_LENGTH,
    `O motivo deve ter no máximo ${REASON_MAX_LENGTH} caracteres.`,
  )

// Posição na fila, a partir de 1 (a frente da fila).
const positionSchema = z
  .number('Informe a posição.')
  .int('A posição deve ser um número inteiro.')
  .min(1, 'A posição deve ser 1 ou mais.')

// Confirmação de quem passa à frente de outros (RF-BAL-07).
const confirmedSchema = z.boolean().default(false).meta({
  description:
    '`false` (padrão): se a mudança passa à frente de alguém, nada é feito e a resposta lista quem desce (`applied: false`). `true`: aplica, e aí o `reason` é obrigatório.',
})

// Parâmetro :bookId das rotas da fila de um livro (o mesmo do acervo).
export const queueBookParamsSchema = bookParamsSchema

// Parâmetro :entryId das rotas de um lugar na fila.
export const queueEntryParamsSchema = z.object({
  entryId: z.string().min(1).max(200),
})

// Corpo de POST /queues (RF-FIL-02 a RF-FIL-04): as edições do mesmo livro em
// que o aluno quer entrar na fila.
export const joinQueueBodySchema = z
  .object({
    bookIds: z
      .array(z.string().min(1).max(200), 'Informe as edições.')
      .min(1, 'Marque ao menos uma edição.')
      .max(
        MAX_EDITIONS_PER_JOIN,
        `Marque no máximo ${MAX_EDITIONS_PER_JOIN} edições.`,
      )
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Não repita a mesma edição.',
      })
      .meta({
        description:
          'Ids das edições (`books`) do mesmo livro. Cada uma ocupa 1 das 7 filas do aluno.',
      }),
  })
  .meta({ id: 'JoinQueueBody' })

// Corpo de POST /librarian/books/:bookId/queue (RF-BAL-06, RF-BAL-07): adiciona
// um aluno à fila do livro, na posição escolhida.
export const addToQueueBodySchema = z
  .object({
    matricula: matriculaSchema,
    position: positionSchema.optional().meta({
      description:
        'Posição final do aluno na fila (1 = frente). Sem ela, vai para o fim, sem pedir confirmação.',
    }),
    reason: z.preprocess(blankToUndefined, reasonSchema.optional()).meta({
      description:
        'Motivo. Obrigatório (com `confirmed: true`) quando o aluno entra à frente de outros.',
    }),
    confirmed: confirmedSchema,
  })
  .meta({ id: 'AddToQueueBody' })

// Corpo de PATCH /librarian/queues/:entryId/position (RF-BAL-06, RF-BAL-07).
export const moveEntryBodySchema = z
  .object({
    position: positionSchema.meta({
      description: 'Nova posição do aluno na fila (1 = frente).',
    }),
    reason: z.preprocess(blankToUndefined, reasonSchema.optional()).meta({
      description:
        'Motivo. Obrigatório (com `confirmed: true`) quando o aluno passa à frente de outros.',
    }),
    confirmed: confirmedSchema,
  })
  .meta({ id: 'MoveEntryBody' })

// Corpo de POST /librarian/queues/:entryId/remove (RF-BAL-06): o motivo é
// obrigatório.
export const removeFromQueueBodySchema = z
  .object({ reason: reasonSchema })
  .meta({ id: 'RemoveFromQueueBody' })
