import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  buildFrozenFine,
  calculateFine,
  fineAmountCents,
  fineStudentOf,
  freezeFields,
  openTotalDelta,
  payDenialOf,
  payFields,
} from '../rules/fine-amount.rules.js'
import { CLOSED_DATES, NOW, makeFine } from './fine.fixtures.js'

describe('valor da multa (fineAmountCents, RF-MUL-01)', () => {
  it('multiplica os dias úteis pelo valor do dia, em centavos', () => {
    expect(fineAmountCents(3, 200)).toBe(600)
  })

  it('sem dia útil de atraso não há multa', () => {
    expect(fineAmountCents(0, 200)).toBe(0)
  })

  it('não tem teto', () => {
    expect(fineAmountCents(100, 200)).toBe(20000)
  })
})

describe('dados do aluno copiados para a multa', () => {
  it('normaliza o nome e usa a matrícula quando o perfil ainda não tem nome', () => {
    expect(
      fineStudentOf({ matricula: '2412858', fullName: 'Lucas Álmeida' }),
    ).toEqual({
      matricula: '2412858',
      name: 'Lucas Álmeida',
      nameNormalized: 'lucas almeida',
    })
    expect(fineStudentOf({ matricula: '2412858' })).toEqual({
      matricula: '2412858',
      name: '2412858',
      nameNormalized: '2412858',
    })
  })
})

describe('cálculo da multa por dias úteis (calculateFine, RF-MUL-01)', () => {
  const marina = {
    dueAt: atLocalTime('2026-10-10', '14:10'),
    ratePerBusinessDayCents: 200,
    closedDates: CLOSED_DATES,
  }

  it('caso da Marina: venceu sáb 10/10, hoje qui 15/10, feriado 12/10 → 13, 14 e 15 → R$ 6,00', () => {
    expect(calculateFine({ ...marina, until: NOW })).toEqual({
      businessDaysLate: 3,
      amountCents: 600,
    })
  })

  it('sem o feriado, o mesmo atraso teria 4 dias úteis', () => {
    expect(
      calculateFine({ ...marina, until: NOW, closedDates: new Set() }),
    ).toEqual({ businessDaysLate: 4, amountCents: 800 })
  })

  it('no dia do vencimento ainda não há dia de atraso', () => {
    expect(
      calculateFine({
        ...marina,
        dueAt: atLocalTime('2026-10-15', '21:55'),
        until: atLocalTime('2026-10-15', '22:30'),
      }),
    ).toEqual({ businessDaysLate: 0, amountCents: 0 })
  })

  it('fim de semana e recesso não contam', () => {
    // Venceu na sexta 16/10; devolvido na segunda 19/10: só a segunda conta.
    expect(
      calculateFine({
        ...marina,
        dueAt: atLocalTime('2026-10-16', '21:55'),
        until: atLocalTime('2026-10-19', '10:00'),
        closedDates: new Set(),
      }).businessDaysLate,
    ).toBe(1)
    // Com a segunda 19/10 em recesso, nenhum dia útil.
    expect(
      calculateFine({
        ...marina,
        dueAt: atLocalTime('2026-10-16', '21:55'),
        until: atLocalTime('2026-10-19', '10:00'),
        closedDates: new Set(['2026-10-19']),
      }).businessDaysLate,
    ).toBe(0)
  })

  it('usa o valor do dia copiado na multa', () => {
    expect(
      calculateFine({ ...marina, until: NOW, ratePerBusinessDayCents: 250 })
        .amountCents,
    ).toBe(750)
  })
})

describe('multa congelada na devolução (freezeFields, RF-MUL-02)', () => {
  const fine = makeFine()
  const returnedAt = atLocalTime('2026-10-15', '12:00')

  it('para de contar na devolução e fica em aberto com o valor fixo', () => {
    expect(
      freezeFields(fine, { returnedAt, closedDates: CLOSED_DATES }),
    ).toEqual({
      status: 'open',
      businessDaysLate: 3,
      amountCents: 600,
      frozenAt: returnedAt,
      updatedAt: returnedAt,
    })
  })

  it('o valor congelado não muda com o passar dos dias', () => {
    const frozen = freezeFields(fine, {
      returnedAt,
      closedDates: CLOSED_DATES,
    })
    const later = calculateFine({
      dueAt: fine.dueAt,
      until: atLocalTime('2026-10-30', '12:00'),
      ratePerBusinessDayCents: 200,
      closedDates: CLOSED_DATES,
    })

    expect(later.amountCents).toBeGreaterThan(frozen.amountCents ?? 0)
    expect(frozen.amountCents).toBe(600)
  })

  it('com "Multa paga agora" fecha direto como paga, com quem recebeu', () => {
    expect(
      freezeFields(fine, {
        returnedAt,
        closedDates: CLOSED_DATES,
        paidNow: { uid: 'uid_ana', name: 'Ana Souza' },
      }),
    ).toEqual({
      status: 'paid',
      businessDaysLate: 3,
      amountCents: 600,
      frozenAt: returnedAt,
      paidAt: returnedAt,
      receivedBy: 'uid_ana',
      receivedByName: 'Ana Souza',
      paidAtReturn: true,
      updatedAt: returnedAt,
    })
  })
})

describe('multa que ainda não existia na devolução (buildFrozenFine)', () => {
  const base = {
    loan: {
      id: 'loan1',
      studentUid: 'uid_marina',
      bookId: 'book_calculo',
      bookTitle: 'Cálculo, Volume 1',
      dueAt: atLocalTime('2026-10-10', '14:10'),
    },
    student: {
      matricula: '2513320',
      name: 'Marina Castro',
      nameNormalized: 'marina castro',
    },
    ratePerBusinessDayCents: 200,
    returnedAt: NOW,
    closedDates: CLOSED_DATES,
  }

  it('nasce congelada, com o aluno e o livro copiados', () => {
    expect(buildFrozenFine(base)).toMatchObject({
      loanId: 'loan1',
      studentUid: 'uid_marina',
      matricula: '2513320',
      studentName: 'Marina Castro',
      studentNameNormalized: 'marina castro',
      bookTitle: 'Cálculo, Volume 1',
      status: 'open',
      ratePerBusinessDayCents: 200,
      businessDaysLate: 3,
      amountCents: 600,
      frozenAt: NOW,
    })
  })

  it('devolvido sem dia útil de atraso, não gera multa', () => {
    expect(
      buildFrozenFine({
        ...base,
        returnedAt: atLocalTime('2026-10-10', '16:00'),
      }),
    ).toBeUndefined()
  })
})

describe('total em aberto do aluno (openTotalDelta)', () => {
  it('multa em aberto soma o valor', () => {
    expect(openTotalDelta({ status: 'open', amountCents: 600 })).toBe(600)
  })

  it('multa paga na devolução não soma nada', () => {
    expect(openTotalDelta({ status: 'paid', amountCents: 600 })).toBe(0)
  })
})

describe('registrar o pagamento no balcão (payDenialOf e payFields, RF-BAL-09)', () => {
  it('só a multa em aberto pode ser paga', () => {
    expect(payDenialOf({ status: 'open' })).toBeNull()
  })

  it('multa contando é recusada: o livro ainda não voltou', () => {
    expect(payDenialOf({ status: 'accruing' })).toBe('accruing')
  })

  it('multa já paga é recusada', () => {
    expect(payDenialOf({ status: 'paid' })).toBe('paid')
  })

  it('grava a hora e quem recebeu', () => {
    expect(payFields({ uid: 'uid_ana', name: 'Ana Souza' }, NOW)).toEqual({
      status: 'paid',
      paidAt: NOW,
      receivedBy: 'uid_ana',
      receivedByName: 'Ana Souza',
      updatedAt: NOW,
    })
  })
})
