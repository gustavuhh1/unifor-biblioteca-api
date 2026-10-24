import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { lookupStudent } = await import('../services/desk-lookup.service.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { NOW, STUDENT_UID, makeActiveLoan, makeLoan, makeStudent } =
  await import('../../loans/__tests__/loan.fixtures.js')
const { seedHolidays, seedStudent } = await import('./desk.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  seedHolidays(h.db)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ficha do aluno pela matrícula (lookupStudent)', () => {
  it('traz o aluno, o pedido para retirar e o livro que está com ele', async () => {
    seedStudent(h.db, { activeLoanCount: 2 })
    h.db.put('loans', 'loan1', makeLoan())
    h.db.put('loans', 'loan2', makeActiveLoan({ bookTitle: 'Redes' }))

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.student).toEqual({
      uid: STUDENT_UID,
      matricula: '2412858',
      name: 'Lucas Almeida',
      initials: null,
      activeLoanCount: 2,
      maxActiveLoans: 10,
      openFineTotalCents: 0,
    })
    expect(card.pickups).toHaveLength(1)
    expect(card.pickups[0]).toMatchObject({
      id: 'loan1',
      bookTitle: 'Código Limpo',
      status: 'awaiting_pickup',
      state: 'ready_for_pickup',
      pickupCode: 'RET-4821',
      scanned: false,
    })
    expect(card.withStudent).toHaveLength(1)
    expect(card.withStudent[0]).toMatchObject({
      id: 'loan2',
      bookTitle: 'Redes',
      status: 'active',
      pickupCode: null,
      fine: null,
    })
    expect(card.blockedReason).toBeNull()
  })

  it('sem nome no Perfil, mostra a matrícula e deixa as iniciais vazias', async () => {
    seedStudent(h.db, { fullName: undefined })

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.student.name).toBe('2412858')
    expect(card.student.initials).toBeNull()
  })

  it('usa as iniciais do Perfil quando existem', async () => {
    seedStudent(h.db, { initials: 'LA' })

    expect(
      (await lookupStudent({ matricula: '2412858' })).student.initials,
    ).toBe('LA')
  })

  it('aluno sem pedidos nem livros devolve listas vazias', async () => {
    seedStudent(h.db, { activeLoanCount: 0 })

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.pickups).toEqual([])
    expect(card.withStudent).toEqual([])
  })

  it('ordena os pedidos pelo prazo mais curto e os livros pelo vencimento mais próximo', async () => {
    seedStudent(h.db, { activeLoanCount: 4 })
    h.db.put(
      'loans',
      'p-tarde',
      makeLoan({
        pickupCode: 'RET-0002',
        pickupDeadline: atLocalTime('2026-10-20', '21:55'),
      }),
    )
    h.db.put(
      'loans',
      'p-cedo',
      makeLoan({
        pickupCode: 'RET-0001',
        pickupDeadline: atLocalTime('2026-10-16', '21:55'),
      }),
    )
    h.db.put(
      'loans',
      'a-longe',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-30', '21:55') }),
    )
    h.db.put(
      'loans',
      'a-perto',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-18', '14:10') }),
    )

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.pickups.map((loan) => loan.id)).toEqual(['p-cedo', 'p-tarde'])
    expect(card.withStudent.map((loan) => loan.id)).toEqual([
      'a-perto',
      'a-longe',
    ])
  })

  it('não mostra pedido de outro aluno nem histórico', async () => {
    seedStudent(h.db)
    h.db.put('loans', 'outro', makeLoan({ studentUid: 'uid_outro' }))
    h.db.put('loans', 'devolvido', makeActiveLoan({ status: 'returned' }))

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.pickups).toEqual([])
    expect(card.withStudent).toEqual([])
  })

  it('nunca devolve o qrToken', async () => {
    seedStudent(h.db)
    h.db.put(
      'loans',
      'loan1',
      makeLoan({ qrToken: 'segredo-do-qr-aaaaaaaaaaaa' }),
    )

    const card = await lookupStudent({ matricula: '2412858' })

    expect(JSON.stringify(card)).not.toContain('segredo-do-qr')
    expect(JSON.stringify(card)).not.toContain('qrToken')
  })
})

describe('ficha pelo pedido (QR ou código)', () => {
  beforeEach(() => {
    seedStudent(h.db, { activeLoanCount: 2 })
    h.db.put(
      'loans',
      'loan1',
      makeLoan({ qrToken: 'qr-do-loan1-aaaaaaaaaaaaaaaa' }),
    )
    h.db.put(
      'loans',
      'loan2',
      makeLoan({
        pickupCode: 'RET-4822',
        qrToken: 'qr-do-loan2-aaaaaaaaaaaaaaaa',
      }),
    )
  })

  it('o QR abre a ficha do dono do pedido e marca o pedido lido', async () => {
    const card = await lookupStudent({
      qrToken: 'qr-do-loan2-aaaaaaaaaaaaaaaa',
    })

    expect(card.student.matricula).toBe('2412858')
    expect(card.pickups.map((loan) => [loan.id, loan.scanned])).toEqual(
      expect.arrayContaining([
        ['loan1', false],
        ['loan2', true],
      ]),
    )
  })

  it('o código do pedido abre a ficha, em maiúsculas ou minúsculas', async () => {
    const card = await lookupStudent({ pickupCode: 'ret-4822' })

    expect(card.pickups.find((loan) => loan.scanned)?.id).toBe('loan2')
  })

  it('QR desconhecido é "pedido não encontrado" (404)', async () => {
    const error = await catchError(lookupStudent({ qrToken: 'nao-existe' }))

    expect(error).toMatchObject({ status: 404, code: 'loan_not_found' })
  })

  it('código que não é de um pedido aguardando retirada é 404', async () => {
    h.db.put('loans', 'ativo', makeActiveLoan({ pickupCode: 'RET-9999' }))

    expect(
      await catchError(lookupStudent({ pickupCode: 'RET-9999' })),
    ).toMatchObject({ status: 404, code: 'loan_not_found' })
    expect(
      await catchError(lookupStudent({ pickupCode: 'RET-0000' })),
    ).toMatchObject({ status: 404, code: 'loan_not_found' })
  })

  it.each([
    ['active', 'Este pedido já foi retirado.'],
    ['returned', 'Este pedido já foi retirado e devolvido.'],
    ['cancelled', 'Este pedido foi cancelado pelo aluno.'],
    ['expired', 'O prazo de retirada deste pedido terminou.'],
  ])('QR de pedido %s é 409 com o motivo', async (status, message) => {
    h.db.put(
      'loans',
      'velho',
      makeLoan({
        status: status as 'active',
        qrToken: 'qr-velho-aaaaaaaaaaaaaaaaaaa',
      }),
    )

    const error = await catchError(
      lookupStudent({ qrToken: 'qr-velho-aaaaaaaaaaaaaaaaaaa' }),
    )

    expect(error).toMatchObject({
      status: 409,
      code: 'loan_not_awaiting_pickup',
      message,
    })
  })
})

describe('ficha de quem não é aluno ativo', () => {
  it('matrícula sem conta é "aluno não encontrado" (404)', async () => {
    expect(
      await catchError(lookupStudent({ matricula: '2400000' })),
    ).toMatchObject({ status: 404, code: 'student_not_found' })
  })

  it('matrícula de bibliotecário recebe a mesma resposta', async () => {
    h.db.put(
      'users',
      'uid_ana',
      makeStudent({ role: 'librarian', matricula: '1000001' }),
    )
    h.db.put('matriculaIndex', '1000001', { uid: 'uid_ana', role: 'librarian' })

    expect(
      await catchError(lookupStudent({ matricula: '1000001' })),
    ).toMatchObject({ status: 404, code: 'student_not_found' })
  })

  it('cadastro ainda não confirmado também', async () => {
    seedStudent(h.db, { status: 'pending_email' })

    expect(
      await catchError(lookupStudent({ matricula: '2412858' })),
    ).toMatchObject({ status: 404, code: 'student_not_found' })
  })
})

describe('livro atrasado na ficha', () => {
  it('bloqueia a retirada e mostra a multa já acumulada: venceu sáb 10/10, são 13, 14 e 15/10', async () => {
    seedStudent(h.db, { activeLoanCount: 2 })
    h.db.put(
      'loans',
      'atrasado',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-10', '14:10') }),
    )
    h.db.put('loans', 'loan1', makeLoan())

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.blockedReason).toBe('overdue')
    expect(card.withStudent[0]).toMatchObject({
      state: 'overdue',
      fine: { businessDaysLate: 3, amountCents: 600 },
    })
    // O pedido continua listado: quem decide é a retirada, que recusa com `overdue`.
    expect(card.pickups).toHaveLength(1)
  })

  it('atrasado só no fim de semana: bloqueia, mas ainda não há multa a mostrar', async () => {
    seedStudent(h.db)
    h.db.put(
      'loans',
      'atrasado',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-15', '10:00') }),
    )

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.blockedReason).toBe('overdue')
    expect(card.withStudent[0]?.fine).toBeNull()
  })

  it('livro que vence em breve não bloqueia nem tem multa', async () => {
    seedStudent(h.db)
    h.db.put('loans', 'loan1', makeActiveLoan())

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.blockedReason).toBeNull()
    expect(card.withStudent[0]).toMatchObject({ state: 'due_soon', fine: null })
  })

  it('multa em aberto sem atraso só aparece no total, sem bloquear', async () => {
    seedStudent(h.db, { openFineTotalCents: 800, activeLoanCount: 0 })

    const card = await lookupStudent({ matricula: '2412858' })

    expect(card.student.openFineTotalCents).toBe(800)
    expect(card.blockedReason).toBeNull()
  })
})
