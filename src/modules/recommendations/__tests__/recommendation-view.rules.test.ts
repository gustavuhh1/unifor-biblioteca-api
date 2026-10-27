import { describe, expect, it } from 'vitest'
import { makeBook } from '../../catalog/__tests__/book.fixtures.js'
import {
  historyReasonText,
  toRecommendationItem,
} from '../rules/recommendation-view.rules.js'

describe('motivos das recomendações (RF-ASS-03)', () => {
  it('usa o assunto mais frequente, ignorando acentos, caixa e repetição no mesmo livro', () => {
    const books = [
      makeBook({
        subjects: ['História', 'História', 'HISTORIA', 'Programação'],
      }),
      makeBook({ subjects: ['programacao'] }),
    ]
    expect(historyReasonText(books)).toBe(
      'Pelo que você mais leu em Programação',
    )
  })

  it('desempata pelo primeiro assunto encontrado no histórico por recência', () => {
    expect(
      historyReasonText([makeBook({ subjects: ['Software', 'Matemática'] })]),
    ).toBe('Pelo que você mais leu em Software')
  })

  it('sem assunto utilizável usa o motivo genérico, sem inventar assunto', () => {
    expect(historyReasonText([])).toBe('Pelo que você leu')
    expect(historyReasonText([makeBook({ subjects: ['  '] })])).toBe(
      'Pelo que você leu',
    )
  })

  it('explica o título que mais pesou e usa apenas os campos do card do acervo', () => {
    const item = toRecommendationItem({
      book: makeBook(),
      becauseOfTitle: 'Arquitetura Limpa',
    })
    expect(item.reasonText).toBe('Porque você leu Arquitetura Limpa')
    expect(item.book.title).toBe('Código Limpo')
    expect(item.book).not.toHaveProperty('searchText')
    expect(item.book).not.toHaveProperty('createdBy')
  })
})
