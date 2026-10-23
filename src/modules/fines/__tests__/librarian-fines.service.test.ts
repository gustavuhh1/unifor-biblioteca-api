import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listLibrarianFines } =
  await import('../services/librarian-fines.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { NOW, makeFine } = await import('./fine.fixtures.js')

// Uma multa de cada aba, como no seed (seção 6.5): a Marina contando, o Pedro
// Henrique e a Júlia em aberto, o Diego pago.
beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db.put('holidays', '2026', {
    items: [
      { date: '2026-10-12', name: 'N. Sra. Aparecida', scope: 'national' },
    ],
  })
  h.db.put('fines', 'marina', makeFine())
  h.db.put(
    'fines',
    'pedro',
    makeFine({
      studentName: 'Pedro Henrique Rocha',
      studentNameNormalized: 'pedro henrique rocha',
      matricula: '2214770',
      studentUid: 'uid_pedro',
      status: 'open',
      businessDaysLate: 5,
      amountCents: 1000,
      frozenAt: atLocalTime('2026-10-12', '10:00'),
    }),
  )
  h.db.put(
    'fines',
    'julia',
    makeFine({
      studentName: 'Júlia Andrade',
      studentNameNormalized: 'julia andrade',
      matricula: '2310456',
      studentUid: 'uid_julia',
      status: 'open',
      businessDaysLate: 2,
      amountCents: 400,
      frozenAt: atLocalTime('2026-10-14', '10:00'),
    }),
  )
  h.db.put(
    'fines',
    'diego',
    makeFine({
      studentName: 'Diego Martins',
      studentNameNormalized: 'diego martins',
      matricula: '2118802',
      studentUid: 'uid_diego',
      status: 'paid',
      businessDaysLate: 3,
      amountCents: 600,
      paidAt: atLocalTime('2026-10-13', '15:00'),
      receivedByName: 'Ana Souza',
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

const ids = async (query: Parameters<typeof listLibrarianFines>[0]) =>
  (await listLibrarianFines(query)).items.map((item) => item.id)

describe('aba Multas (listLibrarianFines, RF-BAL-09)', () => {
  it('Em aberto: só as multas open, as devolvidas há menos tempo primeiro', async () => {
    expect(await ids({ status: 'open' })).toEqual(['julia', 'pedro'])
  })

  it('Contando: só as accruing, com o valor calculado na hora', async () => {
    const { items } = await listLibrarianFines({ status: 'accruing' })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'marina',
      studentName: 'Marina Castro',
      matricula: '2513320',
      status: 'accruing',
      businessDaysLate: 3,
      amountCents: 600,
      paidAtReturn: false,
    })
  })

  it('Pagas: só as paid, com quem recebeu', async () => {
    const { items } = await listLibrarianFines({ status: 'paid' })

    expect(items.map((item) => item.id)).toEqual(['diego'])
    expect(items[0]).toMatchObject({
      receivedByName: 'Ana Souza',
      amountCents: 600,
    })
  })

  it('a resposta diz de qual aba é', async () => {
    expect((await listLibrarianFines({ status: 'paid' })).status).toBe('paid')
  })

  it('aba sem multa devolve a lista vazia', async () => {
    h.db = new Fake()

    expect(await ids({ status: 'open' })).toEqual([])
  })
})

describe('busca por nome ou matrícula', () => {
  it('acha por parte do nome, sem acento nem maiúsculas', async () => {
    expect(await ids({ status: 'open', q: 'JULIA' })).toEqual(['julia'])
    expect(await ids({ status: 'open', q: 'júlia and' })).toEqual(['julia'])
  })

  it('acha pela matrícula inteira', async () => {
    expect(await ids({ status: 'open', q: '2214770' })).toEqual(['pedro'])
  })

  it('a busca fica dentro da aba pedida', async () => {
    expect(await ids({ status: 'open', q: 'Marina' })).toEqual([])
    expect(await ids({ status: 'accruing', q: 'Marina' })).toEqual(['marina'])
  })

  it('busca vazia ou só com espaços mostra a aba toda', async () => {
    expect(await ids({ status: 'open', q: '  ' })).toHaveLength(2)
  })

  it('sem resultado devolve a lista vazia', async () => {
    expect(await ids({ status: 'open', q: 'zzz' })).toEqual([])
  })
})
