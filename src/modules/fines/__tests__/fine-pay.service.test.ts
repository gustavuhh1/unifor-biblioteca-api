import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppError } from '../../../shared/errors.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { payFine } = await import('../services/fine-pay.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { NOW, makeFine } = await import('./fine.fixtures.js')

const LIBRARIAN = 'uid_ana'

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.then(
    () => undefined,
    (error: unknown) => error,
  )) as AppError
}

// A multa em aberto do Pedro Henrique (5 dias, R$ 10,00) e a Ana Souza no balcão.
beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db.put('users', LIBRARIAN, {
    role: 'librarian',
    status: 'active',
    matricula: '1000001',
    fullName: 'Ana Souza',
    deskLabel: 'Balcão 1',
  })
  h.db.put('users', 'uid_pedro', {
    role: 'student',
    status: 'active',
    matricula: '2214770',
    fullName: 'Pedro Henrique Rocha',
    openFineTotalCents: 1400,
  })
  h.db.put(
    'fines',
    'fine1',
    makeFine({
      studentUid: 'uid_pedro',
      studentName: 'Pedro Henrique Rocha',
      studentNameNormalized: 'pedro henrique rocha',
      matricula: '2214770',
      status: 'open',
      businessDaysLate: 5,
      amountCents: 1000,
      frozenAt: atLocalTime('2026-10-12', '10:00'),
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registrar o pagamento no balcão (payFine, RF-BAL-09)', () => {
  it('a multa em aberto vira paga, com a hora e quem recebeu', async () => {
    const paid = await payFine(LIBRARIAN, 'fine1')

    expect(paid).toMatchObject({
      id: 'fine1',
      status: 'paid',
      amountCents: 1000,
      paidAt: NOW.toISOString(),
      receivedByName: 'Ana Souza',
      studentName: 'Pedro Henrique Rocha',
      paidAtReturn: false,
    })
    expect(h.db.read('fines', 'fine1')).toMatchObject({
      status: 'paid',
      paidAt: NOW,
      receivedBy: LIBRARIAN,
      receivedByName: 'Ana Souza',
      updatedAt: NOW,
    })
  })

  it('o valor congelado continua o mesmo depois de paga', async () => {
    await payFine(LIBRARIAN, 'fine1')

    expect(h.db.read('fines', 'fine1')).toMatchObject({
      businessDaysLate: 5,
      amountCents: 1000,
    })
  })

  it('o total em aberto do aluno cai o valor da multa', async () => {
    await payFine(LIBRARIAN, 'fine1')

    expect(h.db.read('users', 'uid_pedro')).toMatchObject({
      openFineTotalCents: 400,
    })
  })

  it('o total em aberto nunca fica negativo', async () => {
    h.db.put('users', 'uid_pedro', {
      role: 'student',
      status: 'active',
      matricula: '2214770',
      openFineTotalCents: 300,
    })

    await payFine(LIBRARIAN, 'fine1')

    expect(h.db.read('users', 'uid_pedro')).toMatchObject({
      openFineTotalCents: 0,
    })
  })

  it('grava o auditLog fine_paid', async () => {
    await payFine(LIBRARIAN, 'fine1')

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN,
        actorRole: 'librarian',
        action: 'fine_paid',
        targetUid: 'uid_pedro',
        bookId: 'book_calculo',
        entityId: 'fine1',
        details: { amountCents: 1000, loanId: 'loan_marina_calculo1' },
        createdAt: NOW,
      }),
    ])
  })

  it('usa a etiqueta do balcão quando o bibliotecário não tem nome', async () => {
    h.db.put('users', LIBRARIAN, {
      role: 'librarian',
      status: 'active',
      matricula: '1000001',
      deskLabel: 'Balcão 1',
    })

    expect((await payFine(LIBRARIAN, 'fine1')).receivedByName).toBe('Balcão 1')
  })
})

describe('multa que não pode ser paga', () => {
  it('multa contando (livro não devolvido) devolve 409 fine_not_payable e nada muda', async () => {
    h.db.put('fines', 'fine2', makeFine({ status: 'accruing' }))

    const error = await catchError(payFine(LIBRARIAN, 'fine2'))

    expect(error).toMatchObject({ status: 409, code: 'fine_not_payable' })
    expect(h.db.read('fines', 'fine2')).toMatchObject({ status: 'accruing' })
    expect(h.db.all('auditLog')).toHaveLength(0)
  })

  it('multa já paga devolve 409 fine_already_paid e não desconta de novo', async () => {
    await payFine(LIBRARIAN, 'fine1')

    const error = await catchError(payFine(LIBRARIAN, 'fine1'))

    expect(error).toMatchObject({ status: 409, code: 'fine_already_paid' })
    expect(h.db.read('users', 'uid_pedro')).toMatchObject({
      openFineTotalCents: 400,
    })
    expect(h.db.all('auditLog')).toHaveLength(1)
  })

  it('multa que não existe devolve 404', async () => {
    expect(await catchError(payFine(LIBRARIAN, 'nao-existe'))).toMatchObject({
      status: 404,
      code: 'fine_not_found',
    })
  })
})
