import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { onCopyReturned } = await import('../services/copy-returned.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeBook, makeCopy } =
  await import('../../catalog/__tests__/book.fixtures.js')
const { makeFine } = await import('../../fines/__tests__/fine.fixtures.js')
const { makeEntry } = await import('../../queues/__tests__/queue.fixtures.js')
const { makeActiveLoan, makeStudent } = await import('./loan.fixtures.js')

// Quinta 15/10/2026, 12:00: o dia de exemplo da seção 2.11.
const RETURNED_AT = atLocalTime('2026-10-15', '12:00')
const MARINA = 'uid_marina'
const CALENDAR = { closedDates: new Set(['2026-10-12']) }
const SETTINGS = { fineCentsPerBusinessDay: 200, queueConfirmHours: 24 }

// A Cálculo I da Marina, que venceu no sábado 10/10, às 14:10.
const loan = {
  id: 'loan1',
  ...makeActiveLoan({
    studentUid: MARINA,
    matricula: '2513320',
    studentName: 'Marina Castro',
    bookId: 'book1',
    bookTitle: 'Cálculo, Volume 1',
    dueAt: atLocalTime('2026-10-10', '14:10'),
    fineId: 'fine1',
  }),
}
const student = {
  uid: MARINA,
  ...makeStudent({
    fullName: 'Marina Castro',
    matricula: '2513320',
    activeLoanCount: 1,
    openFineTotalCents: 0,
  }),
} as never
const book = makeBook({ id: 'book1', copiesAvailable: 0, queueLength: 0 })
const onLoanCopy = {
  id: 'copy1',
  ...makeCopy({
    bookId: 'book1',
    status: 'on_loan',
    currentLoanId: 'loan1',
    dueAt: atLocalTime('2026-10-10', '14:10'),
  }),
}

// Roda onCopyReturned numa transação, como o balcão faz depois das suas leituras.
function returnCopy(
  overrides: Partial<Parameters<typeof onCopyReturned>[1]> = {},
  at = RETURNED_AT,
) {
  return h.db.runTransaction((tx) =>
    onCopyReturned(
      tx as never,
      {
        loan,
        student,
        book,
        copy: onLoanCopy,
        calendar: CALENDAR,
        settings: SETTINGS,
        ...overrides,
      },
      at,
    ),
  )
}

// O empréstimo sem multa criada ainda (a rotina `accrue_fines` não passou).
const loanWithoutFine = { ...loan, fineId: undefined }

// Apaga a multa que o beforeEach criou, para testar a devolução sem ela.
function withoutFineDocument() {
  h.db = new Fake()
  h.db.put('users', MARINA, makeStudent({ openFineTotalCents: 0 }))
  h.db.put('books', 'book1', { ...book, id: undefined })
  h.db.put('copies', 'copy1', { ...onLoanCopy, id: undefined })
  h.db.put('loans', 'loan1', { ...loanWithoutFine, id: undefined })
}

beforeEach(() => {
  h.db = new Fake()
  h.db.put('users', MARINA, {
    ...makeStudent({
      fullName: 'Marina Castro',
      matricula: '2513320',
      openFineTotalCents: 0,
    }),
  })
  h.db.put('loans', 'loan1', { ...loan, id: undefined })
  h.db.put('books', 'book1', { ...book, id: undefined })
  h.db.put('copies', 'copy1', { ...onLoanCopy, id: undefined })
  h.db.put('fines', 'fine1', makeFine())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('congelar a multa na devolução (onCopyReturned, RF-MUL-02)', () => {
  it('caso da Marina: venceu sáb 10/10, devolveu qui 15/10, feriado 12/10 → 3 dias → R$ 6,00 em aberto', async () => {
    const result = await returnCopy()

    expect(h.db.read('fines', 'fine1')).toMatchObject({
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
      frozenAt: RETURNED_AT,
    })
    expect(result.fine).toEqual({
      id: 'fine1',
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
    })
  })

  it('soma o valor em aberto no total do aluno', async () => {
    await returnCopy()

    expect(h.db.read('users', MARINA)).toMatchObject({
      openFineTotalCents: 600,
    })
  })

  it('"Multa paga agora" fecha a multa como paga, sem somar no total em aberto (RF-BAL-08)', async () => {
    const result = await returnCopy({
      paidNow: { uid: 'uid_ana', name: 'Ana Souza' },
    })

    expect(h.db.read('fines', 'fine1')).toMatchObject({
      status: 'paid',
      amountCents: 600,
      paidAt: RETURNED_AT,
      receivedBy: 'uid_ana',
      receivedByName: 'Ana Souza',
      paidAtReturn: true,
    })
    expect(result.fine).toMatchObject({ status: 'paid', amountCents: 600 })
    expect(h.db.read('users', MARINA)).toMatchObject({ openFineTotalCents: 0 })
  })

  it('devolução antes de a rotina criar a multa: ela nasce já congelada e fica ligada ao empréstimo', async () => {
    withoutFineDocument()

    const result = await returnCopy({ loan: loanWithoutFine })

    expect(result.fine).toMatchObject({
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
    })
    const [created] = h.db.all('fines')
    expect(h.db.all('fines')).toHaveLength(1)
    expect(created).toMatchObject({
      loanId: 'loan1',
      studentUid: MARINA,
      matricula: '2513320',
      studentName: 'Marina Castro',
      studentNameNormalized: 'marina castro',
      status: 'open',
      ratePerBusinessDayCents: 200,
      amountCents: 600,
      frozenAt: RETURNED_AT,
    })
    expect(h.db.read('loans', 'loan1')).toMatchObject({
      fineId: result.fine?.id,
    })
    expect(h.db.read('users', MARINA)).toMatchObject({
      openFineTotalCents: 600,
    })
  })

  it('devolução no prazo não gera multa', async () => {
    withoutFineDocument()

    const result = await returnCopy({
      loan: { ...loanWithoutFine, dueAt: atLocalTime('2026-10-16', '21:55') },
    })

    expect(result.fine).toBeUndefined()
    expect(h.db.all('fines')).toHaveLength(0)
  })

  it('devolução atrasada só no fim de semana não gera multa: nenhum dia útil de atraso', async () => {
    withoutFineDocument()

    // Venceu na sexta 16/10 às 21h55 e voltou no sábado 17/10.
    const result = await returnCopy(
      {
        loan: { ...loanWithoutFine, dueAt: atLocalTime('2026-10-16', '21:55') },
      },
      atLocalTime('2026-10-17', '10:00'),
    )

    expect(result.fine).toBeUndefined()
    expect(h.db.all('fines')).toHaveLength(0)
  })

  it('multa que já estava congelada não é mexida de novo', async () => {
    h.db.put(
      'fines',
      'fine1',
      makeFine({ status: 'open', businessDaysLate: 1, amountCents: 200 }),
    )

    const result = await returnCopy()

    expect(result.fine).toBeUndefined()
    expect(h.db.read('fines', 'fine1')).toMatchObject({
      businessDaysLate: 1,
      amountCents: 200,
    })
    expect(h.db.read('users', MARINA)).toMatchObject({ openFineTotalCents: 0 })
  })

  it('usa o valor do dia que a multa copiou na criação', async () => {
    h.db.put('fines', 'fine1', makeFine({ ratePerBusinessDayCents: 250 }))

    await returnCopy()

    expect(h.db.read('fines', 'fine1')).toMatchObject({ amountCents: 750 })
  })
})

describe('passar a vez ao próximo da fila na devolução (onCopyReturned, RF-FIL-06)', () => {
  it('sem fila, o exemplar volta para a estante e o livro ganha um disponível', async () => {
    const result = await returnCopy()

    expect(result.turnStartedFor).toBeUndefined()
    expect(h.db.read('copies', 'copy1')).toMatchObject({ status: 'available' })
    expect(h.db.read('copies', 'copy1')).not.toHaveProperty('dueAt')
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 1 })
  })

  it('com fila, o exemplar fica guardado para o 1º e ele recebe a vez e o aviso na hora', async () => {
    h.db.put(
      'queueEntries',
      'qe2',
      makeEntry({ bookId: 'book1', studentUid: 'uid_carlos', order: 2000 }),
    )
    h.db.put(
      'queueEntries',
      'qe1',
      makeEntry({ bookId: 'book1', studentUid: 'uid_ana', order: 1000 }),
    )

    const result = await returnCopy()

    expect(result.turnStartedFor).toBe('qe1')
    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe1',
    })
    expect(h.db.read('copies', 'copy1')).not.toHaveProperty('currentLoanId')
    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      status: 'your_turn',
      turnStartedAt: RETURNED_AT,
      confirmDeadline: atLocalTime('2026-10-16', '12:00'),
    })
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'waiting',
    })
    expect(h.db.all('users/uid_ana/notifications')[0]).toMatchObject({
      type: 'queue_turn',
      body: 'Confirme até 16/10 às 12:00 que vai retirar.',
    })
    expect(h.db.read('books', 'book1')).toMatchObject({ copiesAvailable: 0 })
  })

  it('a multa e a fila acontecem na mesma devolução', async () => {
    h.db.put(
      'queueEntries',
      'qe1',
      makeEntry({ bookId: 'book1', studentUid: 'uid_ana', order: 1000 }),
    )

    const result = await returnCopy()

    expect(result.fine).toMatchObject({ status: 'open', amountCents: 600 })
    expect(result.turnStartedFor).toBe('qe1')
  })

  it('usa as horas de settings/library para a vez', async () => {
    h.db.put(
      'queueEntries',
      'qe1',
      makeEntry({ bookId: 'book1', studentUid: 'uid_ana', order: 1000 }),
    )

    await returnCopy({
      settings: { ...SETTINGS, queueConfirmHours: 12 },
    })

    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      confirmDeadline: atLocalTime('2026-10-16', '00:00'),
    })
  })
})
