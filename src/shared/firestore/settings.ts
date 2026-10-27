import type { DocumentSnapshot } from 'firebase-admin/firestore'
import { z } from 'zod'
import { getDb } from '../../config/firebase.js'
import {
  DEFAULT_LIBRARY_CONTACT,
  DEFAULT_LOAN_RULES,
  DEFAULT_OFFICIAL_RULES_URL,
  DEFAULT_OPENING_HOURS,
} from '../library.js'
import {
  DEFAULT_REQUEST_LIMITS,
  type RequestLimits,
} from '../rules/request-eligibility.js'
import type { LibraryContact, OpeningHours } from '../types/index.js'
import { COLLECTIONS, SETTINGS_DOC_ID } from './collections.js'
import { optionalDate } from './converters.js'

// Lê o documento settings/library (seção 2.21). Quem lê um número dele usa
// positiveNumberOr, para o documento ausente ou o valor inválido cair no padrão.
export function readLibrarySettings(): Promise<DocumentSnapshot> {
  return getDb().collection(COLLECTIONS.settings).doc(SETTINGS_DOC_ID).get()
}

// O valor, se for um número maior que zero; senão o padrão.
export function positiveNumberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && value > 0 ? value : fallback
}

// Horário de um dia da semana: abre e fecha em "HH:mm", ou null (fechado).
const openingPeriodSchema = z
  .object({
    open: z.string().regex(/^\d{2}:\d{2}$/),
    close: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .nullable()

// Horário de funcionamento por dia da semana (settings.openingHours).
export const openingHoursSchema = z.object({
  mon: openingPeriodSchema,
  tue: openingPeriodSchema,
  wed: openingPeriodSchema,
  thu: openingPeriodSchema,
  fri: openingPeriodSchema,
  sat: openingPeriodSchema,
  sun: openingPeriodSchema,
})

// O horário de funcionamento, se estiver completo e válido; senão o padrão.
function openingHoursOr(value: unknown): OpeningHours {
  const parsed = openingHoursSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_OPENING_HOURS
}

// Os números de settings/library que as regras de empréstimo, renovação, prazo,
// fila e multa usam, já com os padrões no lugar do que faltar ou estiver inválido.
export interface LoanSettings extends RequestLimits {
  loanDays: number
  renewalDays: number
  maxRenewals: number
  pickupBusinessDays: number
  dueSoonDays: number
  // Horas corridas para confirmar a vez na fila (RF-FIL-06).
  queueConfirmHours: number
  // Multa por dia útil de atraso, em centavos (RF-MUL-01).
  fineCentsPerBusinessDay: number
  openingHours: OpeningHours
  // Só no ambiente de teste (RF-SIS-04); quem usa é o relógio (shared/clock.ts).
  simulatedNow: Date | null
}

// Os números das regras de empréstimo de um settings/library já lido. Sem o
// documento ou com valor inválido, valem os padrões da seção 2.21 (10
// empréstimos, 7 filas, 14 dias, 1 renovação, 2 dias úteis...).
function loanSettingsOf(snapshot: DocumentSnapshot): LoanSettings {
  const number = (field: string, fallback: number) =>
    positiveNumberOr(snapshot.get(field), fallback)
  return {
    maxActiveLoans: number(
      'maxActiveLoans',
      DEFAULT_REQUEST_LIMITS.maxActiveLoans,
    ),
    maxActiveQueues: number(
      'maxActiveQueues',
      DEFAULT_REQUEST_LIMITS.maxActiveQueues,
    ),
    loanDays: number('loanDays', DEFAULT_LOAN_RULES.loanDays),
    renewalDays: number('renewalDays', DEFAULT_LOAN_RULES.renewalDays),
    maxRenewals: number('maxRenewals', DEFAULT_LOAN_RULES.maxRenewals),
    pickupBusinessDays: number(
      'pickupBusinessDays',
      DEFAULT_LOAN_RULES.pickupBusinessDays,
    ),
    dueSoonDays: number('dueSoonDays', DEFAULT_LOAN_RULES.dueSoonDays),
    queueConfirmHours: number(
      'queueConfirmHours',
      DEFAULT_LOAN_RULES.queueConfirmHours,
    ),
    fineCentsPerBusinessDay: number(
      'fineCentsPerBusinessDay',
      DEFAULT_LOAN_RULES.fineCentsPerBusinessDay,
    ),
    openingHours: openingHoursOr(snapshot.get('openingHours')),
    simulatedNow: optionalDate(snapshot.get('simulatedNow')),
  }
}

// Lê settings/library (uma leitura só) e devolve os números das regras de
// empréstimo.
export async function readLoanSettings(): Promise<LoanSettings> {
  return loanSettingsOf(await readLibrarySettings())
}

// O texto, se não estiver em branco; senão o padrão.
function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

// Os contatos de um settings/library já lido, campo a campo, com o padrão no
// lugar do que faltar.
function contactOf(snapshot: DocumentSnapshot): LibraryContact {
  const contact: unknown = snapshot.get('contact')
  const field = (name: keyof LibraryContact) =>
    textOr(
      typeof contact === 'object' && contact !== null
        ? (contact as Record<string, unknown>)[name]
        : undefined,
      DEFAULT_LIBRARY_CONTACT[name],
    )
  return {
    place: field('place'),
    biblioZap: field('biblioZap'),
    loanPhone: field('loanPhone'),
    loanEmail: field('loanEmail'),
  }
}

// O que a tela Regras da biblioteca mostra de settings/library (RF-PER-02): os
// números das regras, o horário, os contatos e o link da página oficial.
export interface LibraryInfoSettings extends LoanSettings {
  contact: LibraryContact
  officialRulesUrl: string
}

// Lê settings/library (uma leitura só) para a tela Regras da biblioteca. Campo
// ausente ou inválido cai no padrão.
export async function readLibraryInfoSettings(): Promise<LibraryInfoSettings> {
  const snapshot = await readLibrarySettings()
  return {
    ...loanSettingsOf(snapshot),
    contact: contactOf(snapshot),
    officialRulesUrl: textOr(
      snapshot.get('officialRulesUrl'),
      DEFAULT_OFFICIAL_RULES_URL,
    ),
  }
}

// Lê os limites de empréstimos e de filas ativas em settings/library
// (maxActiveLoans e maxActiveQueues). Sem o documento ou com valor inválido,
// valem 10 e 7. Usada pela página do livro e, depois, pela fila.
export async function readRequestLimits(): Promise<RequestLimits> {
  const { maxActiveLoans, maxActiveQueues } = await readLoanSettings()
  return { maxActiveLoans, maxActiveQueues }
}
