import { z } from 'zod'
import {
  openingHoursSchema,
  libraryContactSchema,
  officialRulesUrlSchema,
} from '../../../shared/library-schemas.js'

// Regras e informações públicas da biblioteca (RF-PER-02).
export const libraryInfoSchema = z
  .object({
    openingHours: openingHoursSchema,
    contact: libraryContactSchema,
    officialRulesUrl: officialRulesUrlSchema,
    maxActiveLoans: z.number().positive(),
    loanDays: z.number().positive(),
    renewalDays: z.number().positive(),
    maxRenewals: z.number().positive(),
    fineCentsPerBusinessDay: z.number().int().positive(),
    maxActiveQueues: z.number().positive(),
    queueConfirmHours: z.number().positive(),
    pickupBusinessDays: z.number().positive(),
  })
  .meta({ id: 'LibraryInfo' })
