import type {
  AuditAction,
  AuditActorRole,
  DateOnly,
  HolidayScope,
  JobName,
  JobStatus,
  Timestamps,
} from './enums.js'

// Documentos do sistema (docs/modelo-de-dados-firestore.md, seções 2.19 a 2.23).

// Um feriado da FeriadosAPI.
export interface HolidayItem {
  date: DateOnly
  name: string
  scope: HolidayScope
}

// holidays/{year}: cache da FeriadosAPI, uma chamada por ano.
export interface Holiday extends Timestamps {
  year: number
  // Código IBGE da cidade, "2304400" (Fortaleza).
  cityIbge: string
  items: HolidayItem[]
  fetchedAt: Date
  source: string
}

// recesses/{recessId}: recesso acadêmico, cadastrado à mão.
export interface Recess extends Timestamps {
  startDate: DateOnly
  // Último dia, inclusive.
  endDate: DateOnly
  description: string
}

// Horário de um dia da semana; null quando a biblioteca fecha.
export interface OpeningPeriod {
  open: string
  close: string
}

// Horário de funcionamento por dia da semana.
export interface OpeningHours {
  mon: OpeningPeriod | null
  tue: OpeningPeriod | null
  wed: OpeningPeriod | null
  thu: OpeningPeriod | null
  fri: OpeningPeriod | null
  sat: OpeningPeriod | null
  sun: OpeningPeriod | null
}

// Contatos mostrados na tela Regras da biblioteca.
export interface LibraryContact {
  place: string
  biblioZap: string
  loanPhone: string
  loanEmail: string
}

// settings/library: horários e regras numéricas. Mudar um número aqui muda a
// regra sem mexer no código.
export interface LibrarySettings extends Timestamps {
  timezone: string
  openingHours: OpeningHours
  maxActiveLoans: number
  maxActiveQueues: number
  loanDays: number
  renewalDays: number
  maxRenewals: number
  pickupBusinessDays: number
  queueConfirmHours: number
  fineCentsPerBusinessDay: number
  dueSoonDays: number
  emailTokenMinutes: number
  emailTokenMaxAttempts: number
  assistantActionMinutes: number
  // Só no ambiente de teste; em produção a API ignora o campo.
  simulatedNow?: Date | null
  contact: LibraryContact
  officialRulesUrl: string
}

// auditLog/{logId}: ações que pedem motivo ou mexem em outro aluno, e outras
// ações sensíveis.
export interface AuditLogEntry extends Timestamps {
  actorUid: string
  actorRole: AuditActorRole
  action: AuditAction
  targetUid?: string
  bookId?: string
  entityId?: string
  reason?: string
  details?: Record<string, unknown>
}

// jobRuns/{runId}: cada execução da rotina agendada.
export interface JobRun extends Timestamps {
  job: JobName
  startedAt: Date
  finishedAt?: Date
  status: JobStatus
  // Quantos documentos tratou.
  processed: number
  error?: string
}
