import { z } from 'zod'
import { openingHoursSchema } from '../../../shared/firestore/settings.js'

// Schemas de saída do módulo da biblioteca. Também alimentam o Swagger. Dinheiro
// vai sempre em centavos (inteiro).

// Contatos da biblioteca (settings/library.contact).
export const libraryContactSchema = z
  .object({
    place: z.string().meta({ example: 'Biblioteca (Praça Central)' }),
    biblioZap: z.string().meta({ example: '(85) 3477-3257' }),
    loanPhone: z.string().meta({ example: '(85) 3477-3162' }),
    loanEmail: z.string().meta({ example: 'bibemprestimo@unifor.br' }),
  })
  .meta({ id: 'LibraryContact' })

// Os números das regras de empréstimo, fila e multa que a tela Regras mostra.
export const libraryRulesSchema = z
  .object({
    maxActiveLoans: z.number().int().meta({
      description:
        'Livros ao mesmo tempo por aluno (pedido não retirado conta).',
    }),
    maxActiveQueues: z.number().int().meta({
      description: 'Filas ao mesmo tempo por aluno (cada edição conta 1).',
    }),
    loanDays: z.number().int().meta({
      description: 'Dias corridos de um empréstimo, a partir da retirada.',
    }),
    renewalDays: z.number().int().meta({
      description: 'Dias corridos de uma renovação.',
    }),
    maxRenewals: z.number().int().meta({
      description: 'Renovações por empréstimo.',
    }),
    pickupBusinessDays: z.number().int().meta({
      description: 'Dias úteis para retirar um pedido.',
    }),
    queueConfirmHours: z.number().int().meta({
      description: 'Horas corridas que o 1º da fila tem para confirmar a vez.',
    }),
    fineCentsPerBusinessDay: z.number().int().meta({
      description: 'Multa por dia útil de atraso, por livro, em centavos.',
    }),
  })
  .meta({ id: 'LibraryRules' })

// Resposta de GET /library/info (RF-PER-02).
export const libraryInfoResponseSchema = z
  .object({
    openingHours: openingHoursSchema.meta({
      description:
        'Horário por dia da semana (`mon` a `sun`), em "HH:mm" no fuso de Fortaleza. `null` = fechado.',
    }),
    contact: libraryContactSchema,
    officialRulesUrl: z.string().meta({
      description:
        'Página oficial da biblioteca, para onde a tela Regras leva.',
      example: 'https://unifor.br/cesta-de-servicos/biblioteca',
    }),
    rules: libraryRulesSchema,
  })
  .meta({ id: 'LibraryInfoResponse' })
