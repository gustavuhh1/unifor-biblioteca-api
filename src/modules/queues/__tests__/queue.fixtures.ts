import { atLocalTime } from '../../../shared/calendar/dates.js'
import type {
  Copy,
  QueueEntry,
  QueueEntryRecord,
} from '../../../shared/types/index.js'
import { makeBook, makeCopy } from '../../catalog/__tests__/book.fixtures.js'
import { makeStudent } from '../../loans/__tests__/loan.fixtures.js'

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

// O que o Firestore em memória oferece para montar os dados do teste.
interface Seedable {
  put(collection: string, id: string, data: object): void
}

// Guarda um aluno ativo (o Lucas, a menos que o teste mude os campos).
export function putStudent(
  db: Seedable,
  uid: string,
  overrides: Record<string, unknown> = {},
) {
  const student = makeStudent(overrides)
  db.put('users', uid, student)
  db.put('matriculaIndex', student.matricula, { uid, role: 'student' })
}

// Guarda o bibliotecário (a Ana Souza do balcão).
export function putLibrarian(db: Seedable, uid = LIBRARIAN_UID) {
  db.put('users', uid, {
    role: 'librarian',
    status: 'active',
    matricula: '1000001',
    fullName: 'Ana Souza',
    email: 'ana@unifor.br',
    authEmail: '1000001@contas.uni-books.app',
    deskLabel: 'Balcão 1',
    activeLoanCount: 0,
    activeQueueCount: 0,
    openFineTotalCents: 0,
    createdAt: NOW,
    updatedAt: NOW,
  })
  db.put('matriculaIndex', '1000001', { uid, role: 'librarian' })
}

// Guarda uma edição com todos os exemplares emprestados (a fila está aberta).
export function putBook(
  db: Seedable,
  id = BOOK_ID,
  overrides: Parameters<typeof makeBook>[0] = {},
) {
  const { id: _id, ...book } = makeBook({
    id,
    copiesTotal: 1,
    copiesAvailable: 0,
    queueLength: 0,
    ...overrides,
  })
  void _id
  db.put('books', id, book)
}

// Guarda um exemplar emprestado da edição.
export function putCopy(
  db: Seedable,
  id = 'copy1',
  overrides: Partial<Copy> = {},
) {
  db.put(
    'copies',
    id,
    makeCopy({
      bookId: BOOK_ID,
      registration: id,
      status: 'on_loan',
      ...overrides,
    }),
  )
}

// Guarda um lugar na fila.
export function putEntry(
  db: Seedable,
  id: string,
  overrides: Partial<QueueEntry> = {},
) {
  db.put('queueEntries', id, makeEntry(overrides))
}

export { catchError } from '../../../test-support/catch-error.js'
