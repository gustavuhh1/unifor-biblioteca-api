import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import type {
  AssistantAction,
  AssistantMessage,
  BookRecord,
} from '../../../shared/types/index.js'
import { makeBook } from '../../catalog/__tests__/book.fixtures.js'
import {
  NOW,
  STUDENT_UID,
  makeStudent,
} from '../../loans/__tests__/loan.fixtures.js'

// Apoio dos testes do Assistente: o aluno (o Lucas do seed), livros e documentos
// no Firestore falso.

export { NOW, STUDENT_UID }

export const ACTIONS_PATH = `users/${STUDENT_UID}/assistantActions`
export const MESSAGES_PATH = `users/${STUDENT_UID}/assistantMessages`

// Guarda o aluno, as configurações vazias (valem os padrões) e o cache de
// feriados de 2026, para nada ir à rede.
export function seedStudent(
  db: FakeFirestore,
  overrides: Record<string, unknown> = {},
) {
  db.put('users', STUDENT_UID, makeStudent(overrides))
  db.put('holidays', '2026', { items: [] })
}

// Guarda um livro ativo (sem o id, que vira o id do documento).
export function putBook(
  db: FakeFirestore,
  id: string,
  overrides: Partial<BookRecord> = {},
): BookRecord {
  const book = makeBook({
    id,
    copiesAvailable: 1,
    queueLength: 0,
    ...overrides,
  })
  const data: Partial<BookRecord> = { ...book }
  delete data.id
  db.put('books', id, data)
  return book
}

// Guarda uma ação do Assistente do aluno.
export function putAction(
  db: FakeFirestore,
  id: string,
  overrides: Partial<AssistantAction> = {},
) {
  db.put(ACTIONS_PATH, id, {
    type: 'request_loan',
    bookIds: ['b1'],
    status: 'proposed',
    preview: {},
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } satisfies AssistantAction)
}

// Guarda uma mensagem da conversa do aluno.
export function putMessage(
  db: FakeFirestore,
  id: string,
  overrides: Partial<AssistantMessage> = {},
) {
  db.put(MESSAGES_PATH, id, {
    sender: 'student',
    text: 'Oi',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } satisfies AssistantMessage)
}
