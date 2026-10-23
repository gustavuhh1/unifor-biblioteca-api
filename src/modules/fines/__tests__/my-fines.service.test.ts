import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listMyFines } = await import('../services/my-fines.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeLoan } = await import('../../loans/__tests__/loan.fixtures.js')
const { NOW, makeFine } = await import('./fine.fixtures.js')

const MARINA = 'uid_marina'

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  // Feriado de 12/10: o exemplo da seção 2.11.
  h.db.put('holidays', '2026', {
    items: [
      { date: '2026-10-12', name: 'N. Sra. Aparecida', scope: 'national' },
    ],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('aluno consulta as multas (listMyFines, RF-MUL-03)', () => {
  it('multa contando: calcula na hora, pelo caso da Marina (venceu sáb 10/10 → 13, 14 e 15/10 → R$ 6,00)', async () => {
    h.db.put('fines', 'fine1', makeFine())

    const { items } = await listMyFines(MARINA)

    expect(items).toEqual([
      expect.objectContaining({
        id: 'fine1',
        bookTitle: 'Cálculo, Volume 1',
        status: 'accruing',
        businessDaysLate: 3,
        ratePerBusinessDayCents: 200,
        amountCents: 600,
        frozenAt: null,
      }),
    ])
  })

  it('multa contando cresce com os dias úteis: sexta 16/10 já são 4 dias, R$ 8,00', async () => {
    h.db.put('fines', 'fine1', makeFine())
    vi.setSystemTime(atLocalTime('2026-10-16', '09:00'))

    const { items } = await listMyFines(MARINA)

    expect(items[0]).toMatchObject({ businessDaysLate: 4, amountCents: 800 })
  })

  it('multa em aberto mostra o valor congelado, mesmo dias depois', async () => {
    h.db.put(
      'fines',
      'fine1',
      makeFine({
        status: 'open',
        businessDaysLate: 2,
        amountCents: 400,
        frozenAt: atLocalTime('2026-10-14', '10:00'),
      }),
    )
    vi.setSystemTime(atLocalTime('2026-10-30', '09:00'))

    const { items } = await listMyFines(MARINA)

    expect(items[0]).toMatchObject({
      status: 'open',
      businessDaysLate: 2,
      amountCents: 400,
      frozenAt: atLocalTime('2026-10-14', '10:00').toISOString(),
    })
  })

  it('multa paga mostra quando foi paga e quem recebeu', async () => {
    h.db.put(
      'fines',
      'fine1',
      makeFine({
        status: 'paid',
        businessDaysLate: 2,
        amountCents: 400,
        paidAt: atLocalTime('2026-10-14', '10:05'),
        receivedByName: 'Ana Souza',
      }),
    )

    const { items } = await listMyFines(MARINA)

    expect(items[0]).toMatchObject({
      status: 'paid',
      paidAt: atLocalTime('2026-10-14', '10:05').toISOString(),
      receivedByName: 'Ana Souza',
    })
  })

  it('só traz as multas do próprio aluno, as de vencimento mais recente primeiro', async () => {
    h.db.put(
      'fines',
      'antiga',
      makeFine({ dueAt: atLocalTime('2026-09-01', '21:55'), status: 'open' }),
    )
    h.db.put('fines', 'nova', makeFine())
    h.db.put('fines', 'de-outro', makeFine({ studentUid: 'uid_lucas' }))

    const { items } = await listMyFines(MARINA)

    expect(items.map((item) => item.id)).toEqual(['nova', 'antiga'])
  })

  it('sem multa devolve a lista vazia', async () => {
    expect(await listMyFines(MARINA)).toEqual({
      items: [],
      openTotalCents: 0,
      blocksNewLoans: false,
    })
  })
})

describe('multa em aberto sem atraso só avisa (RF-MUL-04)', () => {
  it('soma o total em aberto e não bloqueia: sem empréstimo atrasado, blocksNewLoans é false', async () => {
    h.db.put(
      'fines',
      'f1',
      makeFine({ status: 'open', businessDaysLate: 5, amountCents: 1000 }),
    )
    h.db.put(
      'fines',
      'f2',
      makeFine({ status: 'open', businessDaysLate: 2, amountCents: 400 }),
    )
    h.db.put('fines', 'f3', makeFine({ status: 'paid', amountCents: 2000 }))

    const response = await listMyFines(MARINA)

    expect(response.openTotalCents).toBe(1400)
    expect(response.blocksNewLoans).toBe(false)
  })

  it('com um empréstimo atrasado, o bloqueio vem do atraso (blocksNewLoans true)', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({
        studentUid: MARINA,
        status: 'active',
        dueAt: atLocalTime('2026-10-10', '14:10'),
      }),
    )

    expect((await listMyFines(MARINA)).blocksNewLoans).toBe(true)
  })

  it('empréstimo em dia não bloqueia', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeLoan({
        studentUid: MARINA,
        status: 'active',
        dueAt: atLocalTime('2026-10-20', '21:55'),
      }),
    )

    expect((await listMyFines(MARINA)).blocksNewLoans).toBe(false)
  })
})
