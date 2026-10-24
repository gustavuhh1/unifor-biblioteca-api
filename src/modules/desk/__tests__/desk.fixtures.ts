import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import { makeBook, makeCopy } from '../../catalog/__tests__/book.fixtures.js'
import {
  STUDENT_UID,
  makeActiveLoan,
  makeLoan,
  makeStudent,
} from '../../loans/__tests__/loan.fixtures.js'

// Dados de apoio dos testes do balcão. O "hoje" é o NOW dos testes de empréstimo:
// quinta 15/10/2026, 12:00 em Fortaleza.

// O bibliotecário logado dos testes (a Ana do seed).
export const LIBRARIAN_UID = 'uid_ana'

// Guarda os feriados de 2026 (a lista vazia basta para não consultar a
// FeriadosAPI). 12/10 é feriado nacional.
export function seedHolidays(
  db: FakeFirestore,
  dates: readonly string[] = ['2026-10-12'],
) {
  db.put('holidays', '2026', {
    items: dates.map((date) => ({
      date,
      name: 'Feriado de teste',
      scope: 'national',
    })),
  })
}

// Guarda a Ana, bibliotecária com nome.
export function seedLibrarian(db: FakeFirestore) {
  db.put(
    'users',
    LIBRARIAN_UID,
    makeStudent({
      role: 'librarian',
      matricula: '1000001',
      fullName: 'Ana Souza',
      activeLoanCount: 0,
    }),
  )
}

// Guarda o aluno (Lucas) e o índice da matrícula dele.
export function seedStudent(
  db: FakeFirestore,
  overrides: Record<string, unknown> = {},
) {
  db.put(
    'users',
    STUDENT_UID,
    makeStudent({ activeLoanCount: 1, ...overrides }),
  )
  db.put('matriculaIndex', '2412858', { uid: STUDENT_UID, role: 'student' })
}

// Guarda um livro com `onLoan` exemplares emprestados (copy1, copy2...) e os
// demais disponíveis. O primeiro exemplar é o do empréstimo `loan1`.
export function seedBook(
  db: FakeFirestore,
  options: {
    book?: Parameters<typeof makeBook>[0]
    copies?: {
      id: string
      status: string
      dueAt?: Date
      currentLoanId?: string
    }[]
  } = {},
) {
  const book: Record<string, unknown> = {
    ...makeBook({
      id: 'book1',
      copiesTotal: 2,
      copiesAvailable: 0,
      queueLength: 0,
      ...options.book,
    }),
  }
  delete book.id
  db.put('books', 'book1', book)
  for (const copy of options.copies ?? []) {
    db.put(
      'copies',
      copy.id,
      makeCopy({
        bookId: 'book1',
        registration: `reg-${copy.id}`,
        ...copy,
      } as Parameters<typeof makeCopy>[0]),
    )
  }
}

// Pedido aguardando retirada do aluno, com o exemplar reservado (copy1).
export function seedPendingPickup(
  db: FakeFirestore,
  loan: Parameters<typeof makeLoan>[0] = {},
) {
  seedBook(db, {
    copies: [
      { id: 'copy1', status: 'reserved', currentLoanId: 'loan1' },
      { id: 'copy2', status: 'available' },
    ],
    book: { copiesAvailable: 1 },
  })
  db.put('loans', 'loan1', makeLoan(loan))
}

// Empréstimo ativo do aluno, com o exemplar emprestado (copy1).
export function seedActiveLoan(
  db: FakeFirestore,
  loan: Parameters<typeof makeActiveLoan>[0] = {},
) {
  seedBook(db, {
    copies: [
      {
        id: 'copy1',
        status: 'on_loan',
        currentLoanId: 'loan1',
        dueAt: loan.dueAt ?? makeActiveLoan().dueAt,
      },
      { id: 'copy2', status: 'available' },
    ],
    book: {
      copiesAvailable: 1,
      nextReturnAt: loan.dueAt ?? makeActiveLoan().dueAt,
    },
  })
  db.put('loans', 'loan1', makeActiveLoan(loan))
}
