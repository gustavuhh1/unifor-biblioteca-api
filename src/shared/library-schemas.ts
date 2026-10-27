import { z } from 'zod'

// Horário de um dia da semana: abre e fecha em "HH:mm", ou null (fechado).
const openingPeriodSchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .nullable()

// Schema compartilhado da leitura e da resposta dos horários.
export const openingHoursSchema = z.object({
  mon: openingPeriodSchema,
  tue: openingPeriodSchema,
  wed: openingPeriodSchema,
  thu: openingPeriodSchema,
  fri: openingPeriodSchema,
  sat: openingPeriodSchema,
  sun: openingPeriodSchema,
})

// Contatos públicos da biblioteca (RF-PER-02).
export const libraryContactSchema = z.object({
  place: z.string().trim().min(1),
  biblioZap: z.string().trim().min(1),
  loanPhone: z.string().trim().min(1),
  loanEmail: z.email(),
})

// Link público das regras, restrito a HTTP ou HTTPS (RF-PER-02).
export const officialRulesUrlSchema = z.url({ protocol: /^https?$/ })
