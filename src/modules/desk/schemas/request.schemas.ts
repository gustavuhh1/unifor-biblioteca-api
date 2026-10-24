import { z } from 'zod'
import { matriculaSchema } from '../../../shared/matricula.js'
import {
  MATRICULA_SEARCH,
  PICKUP_CODE_PATTERN,
  QR_TOKEN_MAX_LENGTH,
} from '../desk.constants.js'

// Schemas de entrada do módulo do balcão. As mensagens são em português. O
// parâmetro :loanId é o loanParamsSchema do módulo de empréstimos.

// Corpo de POST /librarian/desk/lookup (RF-BAL-02, RF-BAL-03): exatamente um dos
// três jeitos de achar o aluno. Vai no corpo, e não na URL, porque o log de
// requisições registra a URL e o qrToken é segredo.
export const deskLookupBodySchema = z
  .object({
    qrToken: z
      .string('O qrToken deve ser um texto.')
      .trim()
      .min(1, 'O qrToken não pode ser vazio.')
      .max(QR_TOKEN_MAX_LENGTH, 'O qrToken é grande demais.')
      .optional()
      .meta({ description: 'O segredo lido do QR do pedido no app do aluno.' }),
    pickupCode: z
      .string('O código do pedido deve ser um texto.')
      .trim()
      .regex(PICKUP_CODE_PATTERN, 'O código do pedido tem o formato RET-1234.')
      .optional()
      .meta({
        description:
          'O código curto do pedido, digitado sem QR. Maiúsculas ou minúsculas.',
        example: 'RET-4821',
      }),
    matricula: matriculaSchema.optional(),
  })
  .refine(
    (body) =>
      [body.qrToken, body.pickupCode, body.matricula].filter(
        (value) => value !== undefined,
      ).length === 1,
    { message: 'Informe só um: qrToken, pickupCode ou matricula.' },
  )
  .meta({
    id: 'DeskLookupBody',
    description: 'Exatamente um de `qrToken`, `pickupCode` ou `matricula`.',
  })

// Corpo de POST /librarian/loans/:loanId/return (RF-BAL-04, RF-BAL-08).
export const returnLoanBodySchema = z
  .object({
    finePaidNow: z
      .boolean('finePaidNow deve ser verdadeiro ou falso.')
      .default(false)
      .meta({
        description:
          'A chave "Multa paga agora": o bibliotecário já recebeu o valor no balcão, então a multa fecha como paga. Sem multa, é ignorada.',
      }),
  })
  .meta({ id: 'ReturnLoanBody' })

// Query de GET /librarian/pickups (RF-BAL-05): a busca pela matrícula.
export const pickupsQuerySchema = z
  .object({
    matricula: z
      .string('A matrícula deve ser um texto.')
      .trim()
      .regex(MATRICULA_SEARCH, 'Busque pelos dígitos da matrícula (1 a 7).')
      .optional()
      .meta({
        description:
          'Os primeiros dígitos da matrícula do aluno. Vazia lista todos os pedidos.',
      }),
  })
  .meta({ id: 'PickupsQuery' })
