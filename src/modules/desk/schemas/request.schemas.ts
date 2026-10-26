import { z } from 'zod'

export const studentLookupQuerySchema = z.object({
  identifier: z
    .string()
    .trim()
    .regex(/^(?:\d{7}|RET-\d{4}|[A-Za-z0-9_-]{22,256})$/i, {
      error:
        'Informe uma matrícula, um código de retirada ou um token de QR válido.',
    }),
})

export const pickupsQuerySchema = z.object({
  matricula: z
    .string()
    .regex(/^\d{7}$/)
    .optional(),
})

export const deskLoanParamsSchema = z.object({
  loanId: z.string().trim().min(1),
})

export const returnBodySchema = z.object({
  paidNow: z.boolean().optional().default(false),
})
