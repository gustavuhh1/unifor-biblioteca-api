import { describe, expect, it } from 'vitest'
import { LOAN_STATUS, type LoanRecord } from '../types/index.js'
import { readingHistoryOf } from './reading-history.js'

const loan = (bookId: string, data: Partial<LoanRecord> = {}): LoanRecord =>
  ({
    bookId,
    workId: `w-${bookId}`,
    status: LOAN_STATUS.returned,
    ...data,
  }) as LoanRecord

describe('readingHistoryOf: histórico de leitura (RF-ASS-03)', () => {
  it('ordena pela devolução, remove livros repetidos e só depois aplica o limite', () => {
    const loans = [
      loan('a', { returnedAt: new Date('2026-10-20') }),
      loan('b', { returnedAt: new Date('2026-10-23') }),
      loan('b', { returnedAt: new Date('2026-10-22') }),
      loan('c', { returnedAt: new Date('2026-10-21') }),
    ]
    expect(readingHistoryOf(loans, 2).returnedBookIds).toEqual(['b', 'c'])
    expect(loans.map(({ bookId }) => bookId)).toEqual(['a', 'b', 'b', 'c'])
  })

  it('exclui as obras de qualquer situação, mesmo fora do limite dos devolvidos', () => {
    const loans = Object.values(LOAN_STATUS).map((status) =>
      loan(status, { status }),
    )
    const history = readingHistoryOf(loans, 0)
    expect(history.returnedBookIds).toEqual([])
    expect(history.borrowedWorkIds).toEqual(
      new Set(loans.map(({ workId }) => workId)),
    )
    expect(readingHistoryOf(loans, loans.length).returnedBookIds).toEqual([
      LOAN_STATUS.returned,
    ])
  })

  it('aceita histórico vazio e devolução antiga sem data', () => {
    expect(readingHistoryOf([], 6)).toEqual({
      returnedBookIds: [],
      borrowedWorkIds: new Set(),
    })
    expect(
      readingHistoryOf(
        [loan('a'), loan('b', { returnedAt: new Date('2026-10-20') })],
        6,
      ).returnedBookIds,
    ).toEqual(['b', 'a'])
  })
})
