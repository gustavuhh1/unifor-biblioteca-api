import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { accrueFines } = await import('../services/fine-accrue.service.js')
const { registerReturn } =
  await import('../../desk/services/loan-return.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeActiveLoan, makeStudent, STUDENT_UID } =
  await import('../../loans/__tests__/loan.fixtures.js')
const { LIBRARIAN_UID, seedHolidays, seedLibrarian } =
  await import('../../desk/__tests__/desk.fixtures.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')

// O Código Limpo do Lucas venceu no sábado 10/10, às 14h10; 12/10 é feriado. A rotina
// roda cedo na terça 13/10: o 1º dia útil de atraso é hoje.
const DUE = atLocalTime('2026-10-10', '14:10')
const TUESDAY = atLocalTime('2026-10-13', '06:00')

function seedLoan(overrides: Parameters<typeof makeActiveLoan>[0] = {}) {
  h.db.put(
    'users',
    STUDENT_UID,
    makeStudent({ activeLoanCount: 1, booksReadByYear: {} }),
  )
  h.db.put('loans', 'loan1', makeActiveLoan({ dueAt: DUE, ...overrides }))
}

beforeEach(() => {
  h.db = new Fake()
  seedHolidays(h.db)
})

describe('multa que começa a contar (accrueFines, RF-MUL-01)', () => {
  it('cria a multa contando no 1º dia útil de atraso, ligada ao empréstimo', async () => {
    seedLoan()

    expect(await accrueFines(TUESDAY)).toBe(1)

    const [fine] = h.db.all('fines')
    expect(fine).toMatchObject({
      loanId: 'loan1',
      studentUid: STUDENT_UID,
      matricula: '2412858',
      studentName: 'Lucas Almeida',
      studentNameNormalized: 'lucas almeida',
      bookId: 'book1',
      bookTitle: 'Código Limpo',
      status: 'accruing',
      ratePerBusinessDayCents: 200,
      dueAt: DUE,
      createdAt: TUESDAY,
    })
    expect(fine).not.toHaveProperty('amountCents')
    expect(fine).not.toHaveProperty('frozenAt')
    const { fineId } = h.db.read('loans', 'loan1') as { fineId: string }
    expect(h.db.read('fines', fineId)).toMatchObject({ loanId: 'loan1' })
  })

  it('a multa contando ainda não entra no total em aberto do aluno', async () => {
    seedLoan()

    await accrueFines(TUESDAY)

    expect(h.db.read('users', STUDENT_UID)).toMatchObject({
      openFineTotalCents: 0,
    })
  })

  it('sem nome no Perfil, a multa usa a matrícula', async () => {
    h.db.put(
      'users',
      STUDENT_UID,
      makeStudent({ fullName: undefined, fullNameNormalized: undefined }),
    )
    h.db.put('loans', 'loan1', makeActiveLoan({ dueAt: DUE }))

    await accrueFines(TUESDAY)

    expect(h.db.all('fines')[0]).toMatchObject({
      studentName: '2412858',
      studentNameNormalized: '2412858',
    })
  })

  it('vencimento só no fim de semana ou no feriado: ainda não há dia útil de atraso', async () => {
    seedLoan()

    // Segunda 12/10 é feriado; sábado 10/10 e domingo 11/10 não contam.
    expect(await accrueFines(atLocalTime('2026-10-12', '06:00'))).toBe(0)
    expect(h.db.all('fines')).toEqual([])
  })

  it('empréstimo no prazo ou sem atraso não ganha multa', async () => {
    seedLoan({ dueAt: atLocalTime('2026-10-14', '21:55') })

    expect(await accrueFines(TUESDAY)).toBe(0)
  })

  it('empréstimo que já tem multa não ganha outra', async () => {
    seedLoan({ fineId: 'fine-antiga' })

    expect(await accrueFines(TUESDAY)).toBe(0)
    expect(h.db.all('fines')).toEqual([])
  })

  it('rodar de novo não cria uma segunda multa', async () => {
    seedLoan()

    await accrueFines(TUESDAY)
    const second = await accrueFines(TUESDAY)

    expect(second).toBe(0)
    expect(h.db.all('fines')).toHaveLength(1)
  })

  it('pedido ainda não retirado ou empréstimo devolvido não gera multa', async () => {
    h.db.put('users', STUDENT_UID, makeStudent())
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ status: 'returned', dueAt: DUE }),
    )
    h.db.put(
      'loans',
      'loan2',
      makeActiveLoan({ status: 'awaiting_pickup', dueAt: DUE }),
    )

    expect(await accrueFines(TUESDAY)).toBe(0)
  })
})

describe('devolução depois da multa contando (RF-MUL-02)', () => {
  it('a devolução congela a multa que a rotina criou, sem criar outra', async () => {
    seedLibrarian(h.db)
    seedLoan({ copyId: 'copy1' })
    const book: Record<string, unknown> = {
      ...makeBook({ id: 'book1', copiesTotal: 1, copiesAvailable: 0 }),
    }
    delete book.id
    h.db.put('books', 'book1', book)
    h.db.put(
      'copies',
      'copy1',
      makeCopy({ bookId: 'book1', status: 'on_loan', currentLoanId: 'loan1' }),
    )
    await accrueFines(TUESDAY)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(atLocalTime('2026-10-15', '12:00'))

    const response = await registerReturn(LIBRARIAN_UID, 'loan1', {
      finePaidNow: false,
    })

    vi.useRealTimers()
    expect(h.db.all('fines')).toHaveLength(1)
    expect(response.fine).toMatchObject({
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
    })
  })
})
