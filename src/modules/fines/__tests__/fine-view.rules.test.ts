import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  currentFineValues,
  matchesFineSearch,
  openTotalCentsOf,
  toFineResponse,
  toLibrarianFineResponse,
} from '../rules/fine-view.rules.js'
import { CLOSED_DATES, NOW, makeFine, makeFineRecord } from './fine.fixtures.js'

describe('valores da multa para mostrar (currentFineValues)', () => {
  it('multa contando é calculada na hora: a Marina deve R$ 6,00 em 15/10', () => {
    expect(currentFineValues(makeFine(), NOW, CLOSED_DATES)).toEqual({
      businessDaysLate: 3,
      amountCents: 600,
    })
  })

  it('a multa contando cresce um dia útil depois', () => {
    expect(
      currentFineValues(
        makeFine(),
        atLocalTime('2026-10-16', '09:00'),
        CLOSED_DATES,
      ),
    ).toEqual({ businessDaysLate: 4, amountCents: 800 })
  })

  it('multa em aberto mostra o valor congelado, não o de hoje', () => {
    const open = makeFine({
      status: 'open',
      businessDaysLate: 2,
      amountCents: 400,
    })

    expect(
      currentFineValues(open, atLocalTime('2026-11-30', '09:00'), CLOSED_DATES),
    ).toEqual({ businessDaysLate: 2, amountCents: 400 })
  })
})

describe('multa na resposta do aluno (toFineResponse)', () => {
  it('mostra valor em centavos, dias de atraso e livro', () => {
    expect(toFineResponse(makeFineRecord('fine1'), NOW, CLOSED_DATES)).toEqual({
      id: 'fine1',
      loanId: 'loan_marina_calculo1',
      bookId: 'book_calculo',
      bookTitle: 'Cálculo, Volume 1',
      status: 'accruing',
      dueAt: atLocalTime('2026-10-10', '14:10').toISOString(),
      businessDaysLate: 3,
      ratePerBusinessDayCents: 200,
      amountCents: 600,
      frozenAt: null,
      paidAt: null,
      receivedByName: null,
    })
  })

  it('multa paga mostra quando e quem recebeu', () => {
    const paid = makeFineRecord('fine2', {
      status: 'paid',
      businessDaysLate: 2,
      amountCents: 400,
      frozenAt: atLocalTime('2026-10-14', '10:00'),
      paidAt: atLocalTime('2026-10-14', '10:05'),
      receivedByName: 'Ana Souza',
    })

    expect(toFineResponse(paid, NOW, CLOSED_DATES)).toMatchObject({
      status: 'paid',
      amountCents: 400,
      paidAt: atLocalTime('2026-10-14', '10:05').toISOString(),
      receivedByName: 'Ana Souza',
    })
  })
})

describe('multa na aba Multas (toLibrarianFineResponse)', () => {
  it('acrescenta o aluno e se foi paga na devolução', () => {
    expect(
      toLibrarianFineResponse(makeFineRecord('fine1'), NOW, CLOSED_DATES),
    ).toMatchObject({
      studentName: 'Marina Castro',
      matricula: '2513320',
      paidAtReturn: false,
    })
    expect(
      toLibrarianFineResponse(
        makeFineRecord('fine1', { status: 'paid', paidAtReturn: true }),
        NOW,
        CLOSED_DATES,
      ).paidAtReturn,
    ).toBe(true)
  })
})

describe('total em aberto (openTotalCentsOf, RF-MUL-04)', () => {
  it('soma só as multas em aberto', () => {
    expect(
      openTotalCentsOf([
        { status: 'open', amountCents: 600 },
        { status: 'open', amountCents: 400 },
        { status: 'accruing', amountCents: 800 },
        { status: 'paid', amountCents: 1000 },
      ]),
    ).toBe(1000)
  })

  it('sem multa em aberto o total é zero', () => {
    expect(openTotalCentsOf([])).toBe(0)
  })
})

describe('busca na aba Multas (matchesFineSearch, RF-BAL-09)', () => {
  const fine = { matricula: '2513320', studentNameNormalized: 'marina castro' }

  it('busca vazia mostra tudo', () => {
    expect(matchesFineSearch(fine, undefined)).toBe(true)
    expect(matchesFineSearch(fine, '   ')).toBe(true)
  })

  it('acha por parte do nome, sem acento nem maiúsculas', () => {
    expect(matchesFineSearch(fine, 'MARI')).toBe(true)
    expect(matchesFineSearch(fine, 'marína cas')).toBe(true)
  })

  it('exige todas as palavras digitadas', () => {
    expect(matchesFineSearch(fine, 'marina souza')).toBe(false)
  })

  it('acha pela matrícula inteira, mas não por um pedaço dela', () => {
    expect(matchesFineSearch(fine, '2513320')).toBe(true)
    expect(matchesFineSearch(fine, '25133')).toBe(false)
  })
})
