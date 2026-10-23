import { atLocalTime } from '../../../shared/calendar/dates.js'
import type { Loan, LoanRecord } from '../../../shared/types/index.js'

// "Hoje" dos testes de empréstimo: quinta 15/10/2026, 12:00 em Fortaleza (o dia de
// exemplo dos documentos).
export const NOW = atLocalTime('2026-10-15', '12:00')

// O aluno logado dos testes (o Lucas do seed).
export const STUDENT_UID = 'uid_lucas'

// Aluno ativo de exemplo; cada teste ajusta o que precisa.
export function makeStudent(overrides: Record<string, unknown> = {}) {
  return {
    role: 'student',
    status: 'active',
    matricula: '2412858',
    fullName: 'Lucas Almeida',
    email: 'lucas@edu.unifor.br',
    authEmail: '2412858@contas.uni-books.app',
    activeLoanCount: 0,
    activeQueueCount: 0,
    openFineTotalCents: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// Pedido aguardando retirada de exemplo (o RET-4821 do Lucas): feito hoje, com
// prazo até segunda 19/10 no fechamento.
export function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    studentUid: STUDENT_UID,
    matricula: '2412858',
    studentName: 'Lucas Almeida',
    bookId: 'book1',
    workId: 'codigo-limpo--martin',
    copyId: 'copy1',
    bookTitle: 'Código Limpo',
    bookShelf: 'Estante 005.1',
    status: 'awaiting_pickup',
    origin: 'request',
    pickupCode: 'RET-4821',
    qrToken: 'qr-token-de-teste-aaaaaaaaaaaaaaaaaaa',
    requestedAt: NOW,
    pickupDeadline: atLocalTime('2026-10-19', '21:55'),
    loanDays: 14,
    renewalCount: 0,
    remindersSent: {},
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

// Empréstimo ativo de exemplo: retirado em 02/10, vence sexta 16/10 às 21:55 (vence
// em breve em relação a NOW).
export function makeActiveLoan(overrides: Partial<Loan> = {}): Loan {
  return makeLoan({
    status: 'active',
    requestedAt: atLocalTime('2026-10-01', '10:00'),
    pickupDeadline: atLocalTime('2026-10-05', '21:55'),
    pickedUpAt: atLocalTime('2026-10-02', '21:55'),
    dueAt: atLocalTime('2026-10-16', '21:55'),
    ...overrides,
  })
}

// Um pedido já lido, com id (o que o repositório devolve).
export function makeLoanRecord(
  id: string,
  overrides: Partial<Loan> = {},
): LoanRecord {
  return { id, ...makeLoan(overrides) }
}
