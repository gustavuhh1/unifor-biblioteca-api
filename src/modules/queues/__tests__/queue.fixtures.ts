import { atLocalTime } from '../../../shared/calendar/dates.js'
import type {
  QueueEntry,
  QueueEntryRecord,
} from '../../../shared/types/index.js'

// "Hoje" dos testes de fila: sexta 16/10/2026, 09:12 em Fortaleza (a hora da vez
// do exemplo da seção 2.14).
export const NOW = atLocalTime('2026-10-16', '09:12')

// O livro e o aluno dos testes (o Lucas na fila do Código Limpo).
export const BOOK_ID = 'book1'
export const STUDENT_UID = 'uid_lucas'
export const LIBRARIAN_UID = 'uid_ana'

// Lugar na fila de exemplo: o Lucas esperando (`waiting`) em Código Limpo.
export function makeEntry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    bookId: BOOK_ID,
    workId: 'codigo-limpo--martin',
    bookTitle: 'Código Limpo',
    studentUid: STUDENT_UID,
    matricula: '2412858',
    studentName: 'Lucas Almeida',
    status: 'waiting',
    order: 1000,
    joinedAt: atLocalTime('2026-10-09', '10:00'),
    origin: 'student',
    notifyCount: 0,
    createdAt: atLocalTime('2026-10-09', '10:00'),
    updatedAt: atLocalTime('2026-10-09', '10:00'),
    ...overrides,
  }
}

// Um lugar já lido, com id.
export function makeEntryRecord(
  id: string,
  overrides: Partial<QueueEntry> = {},
): QueueEntryRecord {
  return { id, ...makeEntry(overrides) }
}

// Os quatro alunos da fila do Arquitetura Limpa do seed, na ordem (seção 6.3):
// Ana Beatriz, Lucas, Carlos e Marina.
export function makeQueue(): QueueEntryRecord[] {
  const student = (uid: string, name: string, matricula: string) => ({
    studentUid: uid,
    studentName: name,
    matricula,
  })
  return [
    makeEntryRecord('qe1', {
      ...student('uid_ana_beatriz', 'Ana Beatriz Lima', '2311001'),
      order: 1000,
    }),
    makeEntryRecord('qe2', {
      ...student('uid_lucas', 'Lucas Almeida', '2412858'),
      order: 2000,
    }),
    makeEntryRecord('qe3', {
      ...student('uid_carlos', 'Carlos Eduardo Sá', '2210001'),
      order: 3000,
    }),
    makeEntryRecord('qe4', {
      ...student('uid_marina', 'Marina Castro', '2513320'),
      order: 4000,
    }),
  ]
}
