import { describe, expect, it } from 'vitest'
import {
  rankSimilarBooks,
  recommendFromHistory,
  similarityScore,
  type SimilarityBook,
} from './book-similarity.js'

const book = (
  id: string,
  data: Partial<SimilarityBook> = {},
): SimilarityBook => ({
  id,
  workId: `w-${id}`,
  title: `Livro ${id}`,
  authors: [],
  subjects: [],
  ...data,
})

describe('similarityScore: parecença por assunto e autor', () => {
  it('assunto em comum vale mais que autor em comum', () => {
    const base = book('a', { subjects: ['Software'], authors: ['Martin'] })

    expect(similarityScore(base, book('b', { subjects: ['Software'] }))).toBe(2)
    expect(similarityScore(base, book('c', { authors: ['Martin'] }))).toBe(1)
  })

  it('compara sem acento e sem diferenciar maiúsculas', () => {
    const a = book('a', { subjects: ['Programação'] })

    expect(similarityScore(a, book('b', { subjects: ['programacao'] }))).toBe(2)
  })

  it('é zero quando não há nada em comum', () => {
    expect(similarityScore(book('a'), book('b'))).toBe(0)
  })
})

describe('rankSimilarBooks: livros parecidos (RF-ASS-02)', () => {
  const target = book('alvo', { subjects: ['Software', 'Arquitetura'] })

  it('ordena pela parecença e desempata pelo título', () => {
    const candidates = [
      book('x', { title: 'Zeta', subjects: ['Software'] }),
      book('y', { title: 'Alfa', subjects: ['Software'] }),
      book('z', { title: 'Beta', subjects: ['Software', 'Arquitetura'] }),
    ]

    const result = rankSimilarBooks(target, candidates, { limit: 6 })

    expect(result.map((b) => b.id)).toEqual(['z', 'y', 'x'])
  })

  it('tira a mesma obra, as obras excluídas e os livros sem nada em comum', () => {
    const candidates = [
      book('outra-edicao', { workId: target.workId, subjects: ['Software'] }),
      book('pego', { subjects: ['Software'] }),
      book('nada'),
      book('ok', { subjects: ['Arquitetura'] }),
    ]

    const result = rankSimilarBooks(target, candidates, {
      limit: 6,
      excludeWorkIds: new Set(['w-pego']),
    })

    expect(result.map((b) => b.id)).toEqual(['ok'])
  })

  it('fica com uma edição por obra e respeita o limite', () => {
    const candidates = [
      book('e1', { workId: 'obra', title: 'A', subjects: ['Software'] }),
      book('e2', { workId: 'obra', title: 'B', subjects: ['Software'] }),
      book('f', { title: 'C', subjects: ['Software'] }),
      book('g', { title: 'D', subjects: ['Software'] }),
    ]

    const result = rankSimilarBooks(target, candidates, { limit: 2 })

    expect(result.map((b) => b.id)).toEqual(['e1', 'f'])
  })
})

describe('recommendFromHistory: sugestões pelo histórico (RF-ASS-03)', () => {
  const lido = book('lido', {
    title: 'Arquitetura Limpa',
    subjects: ['Software'],
  })

  it('sugere parecidos e diz qual livro lido pesou mais', () => {
    const result = recommendFromHistory(
      [lido],
      [book('s', { subjects: ['Software'] })],
      { limit: 6 },
    )

    expect(result).toEqual([
      {
        book: expect.objectContaining({ id: 's' }),
        becauseOfTitle: 'Arquitetura Limpa',
      },
    ])
  })

  it('não sugere obra já lida nem obra pedida ou emprestada', () => {
    const result = recommendFromHistory(
      [lido],
      [
        book('outra-edicao', { workId: lido.workId, subjects: ['Software'] }),
        book('emprestado', { subjects: ['Software'] }),
      ],
      { limit: 6, excludeWorkIds: new Set(['w-emprestado']) },
    )

    expect(result).toEqual([])
  })

  it('sem histórico, a lista sai vazia', () => {
    expect(
      recommendFromHistory([], [book('s', { subjects: ['Software'] })], {
        limit: 6,
      }),
    ).toEqual([])
  })
})
