import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listPickups } = await import('../services/pickup-list.service.js')
const { filterByMatricula, toPickupItem } =
  await import('../rules/pickup-list.rules.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeActiveLoan, makeLoan, makeLoanRecord } =
  await import('../../loans/__tests__/loan.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
})

describe('um pedido na lista (toPickupItem)', () => {
  it('traz o código, o aluno, o livro e o prazo, e nunca o qrToken', () => {
    const item = toPickupItem(
      makeLoanRecord('loan1', { qrToken: 'segredo-do-qr-aaaaaaaaaaaa' }),
    )

    expect(item).toEqual({
      loanId: 'loan1',
      pickupCode: 'RET-4821',
      matricula: '2412858',
      studentName: 'Lucas Almeida',
      bookTitle: 'Código Limpo',
      bookShelf: 'Estante 005.1',
      pickupDeadline: atLocalTime('2026-10-19', '21:55').toISOString(),
    })
    expect(JSON.stringify(item)).not.toContain('segredo-do-qr')
  })
})

describe('busca pela matrícula (filterByMatricula)', () => {
  const loans = [
    makeLoanRecord('a', { matricula: '2412858' }),
    makeLoanRecord('b', { matricula: '2412901' }),
    makeLoanRecord('c', { matricula: '2513320' }),
  ]

  it('sem busca, devolve todos na mesma ordem', () => {
    expect(filterByMatricula(loans, undefined).map((l) => l.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('filtra pelos primeiros dígitos, enquanto o bibliotecário digita', () => {
    expect(filterByMatricula(loans, '2412').map((l) => l.id)).toEqual([
      'a',
      'b',
    ])
    expect(filterByMatricula(loans, '2412858').map((l) => l.id)).toEqual(['a'])
  })

  it('só vale do começo da matrícula: dígitos do meio não casam', () => {
    expect(filterByMatricula(loans, '1285')).toEqual([])
  })
})

describe('Retiradas (listPickups, RF-BAL-05)', () => {
  it('lista só os pedidos aguardando retirada, do prazo mais curto ao mais longo', async () => {
    h.db.put(
      'loans',
      'tarde',
      makeLoan({ pickupDeadline: atLocalTime('2026-10-22', '21:55') }),
    )
    h.db.put(
      'loans',
      'cedo',
      makeLoan({ pickupDeadline: atLocalTime('2026-10-16', '21:55') }),
    )
    h.db.put(
      'loans',
      'meio',
      makeLoan({ pickupDeadline: atLocalTime('2026-10-19', '21:55') }),
    )
    h.db.put('loans', 'ativo', makeActiveLoan())
    h.db.put('loans', 'cancelado', makeLoan({ status: 'cancelled' }))

    const { items } = await listPickups({})

    expect(items.map((item) => item.loanId)).toEqual(['cedo', 'meio', 'tarde'])
  })

  it('busca pelos primeiros dígitos da matrícula', async () => {
    h.db.put('loans', 'lucas', makeLoan({ matricula: '2412858' }))
    h.db.put(
      'loans',
      'marina',
      makeLoan({ matricula: '2513320', studentName: 'Marina Castro' }),
    )

    const { items } = await listPickups({ matricula: '25' })

    expect(items.map((item) => item.loanId)).toEqual(['marina'])
  })

  it('sem pedidos, devolve a lista vazia', async () => {
    expect(await listPickups({})).toEqual({ items: [] })
  })
})
