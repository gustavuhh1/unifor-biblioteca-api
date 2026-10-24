import { atLocalTime } from '../../../shared/calendar/dates.js'
import type { Fine, FineRecord } from '../../../shared/types/index.js'

// Feriado do exemplo da seção 2.11 (12/10) como datas fechadas do calendário.
export const CLOSED_DATES: ReadonlySet<string> = new Set(['2026-10-12'])

// "Hoje" dos testes de multa: quinta 15/10/2026, 12:00 em Fortaleza.
export const NOW = atLocalTime('2026-10-15', '12:00')

// Multa `accruing` da Marina (a Cálculo I que venceu no sábado 10/10, às 14:10).
export function makeFine(overrides: Partial<Fine> = {}): Fine {
  return {
    loanId: 'loan_marina_calculo1',
    studentUid: 'uid_marina',
    matricula: '2513320',
    studentName: 'Marina Castro',
    studentNameNormalized: 'marina castro',
    bookId: 'book_calculo',
    bookTitle: 'Cálculo, Volume 1',
    status: 'accruing',
    ratePerBusinessDayCents: 200,
    dueAt: atLocalTime('2026-10-10', '14:10'),
    createdAt: atLocalTime('2026-10-13', '08:00'),
    updatedAt: atLocalTime('2026-10-13', '08:00'),
    ...overrides,
  }
}

// Uma multa já lida, com id.
export function makeFineRecord(
  id: string,
  overrides: Partial<Fine> = {},
): FineRecord {
  return { id, ...makeFine(overrides) }
}
