import { z } from 'zod'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'
import { FINE_STATUSES, LOAN_STATUSES } from '../../../shared/types/index.js'

export const deskLoanSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  copyId: z.string(),
  bookTitle: z.string(),
  bookShelf: z.string(),
  status: z.enum(LOAN_STATUSES),
  pickupCode: z.string().nullable(),
  pickupDeadline: isoDate,
  pickedUpAt: isoDate.nullable(),
  dueAt: isoDate.nullable(),
})

export const pickupItemSchema = deskLoanSchema.extend({
  studentUid: z.string(),
  matricula: z.string(),
  studentName: z.string(),
})

export const dashboardResponseSchema = z.object({
  pendingPickups: z.number().int().min(0),
  queueTurnsAwaitingConfirmation: z.number().int().min(0),
  overdueLoans: z.number().int().min(0),
  returnsToday: z.number().int().min(0),
})

export const pickupsResponseSchema = z.object({
  items: z.array(pickupItemSchema),
})

export const studentLookupResponseSchema = z.object({
  student: z.object({
    uid: z.string(),
    matricula: z.string(),
    name: z.string(),
    email: z.string(),
    activeLoanCount: z.number().int().min(0),
    activeQueueCount: z.number().int().min(0),
    openFineTotalCents: z.number().int().min(0),
  }),
  selectedLoanId: z.string().nullable(),
  hasOverdueLoan: z.boolean(),
  loans: z.array(deskLoanSchema),
})

export const pickupResponseSchema = z.object({ loan: deskLoanSchema })

export const returnResponseSchema = z.object({
  loan: deskLoanSchema,
  fine: z
    .object({
      id: z.string(),
      status: z.enum(FINE_STATUSES),
      businessDaysLate: z.number().int().min(0),
      amountCents: z.number().int().min(0),
    })
    .nullable(),
  turnStartedFor: z.string().nullable(),
})
