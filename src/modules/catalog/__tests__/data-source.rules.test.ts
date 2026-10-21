import { describe, expect, it } from 'vitest'
import {
  dataSourceAfterEdit,
  dataSourceForNewBook,
} from '../rules/data-source.rules.js'

const volume = {
  title: 'Código Limpo',
  authors: ['Robert C. Martin'],
  publisher: 'Alta Books',
  synopsis: 'Sinopse do Google.',
}

describe('origem dos dados de um livro novo (dataSourceForNewBook)', () => {
  it('é manual quando nada veio do Google Books', () => {
    expect(
      dataSourceForNewBook({
        hasVolumeId: false,
        volume: undefined,
        book: volume,
      }),
    ).toBe('manual')
  })

  it('é google_books quando veio do Google e nada foi alterado à mão', () => {
    expect(
      dataSourceForNewBook({ hasVolumeId: true, volume, book: { ...volume } }),
    ).toBe('google_books')
  })

  it('é mixed quando o bibliotecário alterou título, autores, editora ou sinopse', () => {
    for (const changed of [
      { title: 'Código Limpo (2ª ed.)' },
      { authors: ['Robert Martin'] },
      { publisher: 'Outra' },
      { synopsis: 'Minha sinopse' },
    ]) {
      expect(
        dataSourceForNewBook({
          hasVolumeId: true,
          volume,
          book: { ...volume, ...changed },
        }),
      ).toBe('mixed')
    }
  })

  it('é mixed quando o bibliotecário preencheu à mão o que o Google não trouxe', () => {
    expect(
      dataSourceForNewBook({
        hasVolumeId: true,
        volume: { title: 'A', authors: ['B'] },
        book: { title: 'A', authors: ['B'], publisher: 'Preenchida à mão' },
      }),
    ).toBe('mixed')
  })

  it('continua google_books quando o Google não trouxe um campo e ele ficou vazio', () => {
    expect(
      dataSourceForNewBook({
        hasVolumeId: true,
        volume: { title: 'A', authors: ['B'] },
        book: { title: 'A', authors: ['B'] },
      }),
    ).toBe('google_books')
  })

  it('é mixed quando o volume não pôde ser conferido no Google', () => {
    expect(
      dataSourceForNewBook({
        hasVolumeId: true,
        volume: undefined,
        book: volume,
      }),
    ).toBe('mixed')
  })
})

describe('origem dos dados depois da edição (dataSourceAfterEdit)', () => {
  it('google_books vira mixed quando um campo de origem Google muda', () => {
    for (const field of [
      'title',
      'subtitle',
      'authors',
      'publisher',
      'year',
      'synopsis',
      'coverUrl',
      'subjects',
      'language',
    ]) {
      expect(dataSourceAfterEdit('google_books', [field])).toBe('mixed')
    }
  })

  it('google_books continua quando só muda um campo do projeto', () => {
    expect(dataSourceAfterEdit('google_books', ['cdu', 'shelf'])).toBe(
      'google_books',
    )
    expect(dataSourceAfterEdit('google_books', [])).toBe('google_books')
  })

  it('manual continua manual e mixed continua mixed', () => {
    expect(dataSourceAfterEdit('manual', ['title'])).toBe('manual')
    expect(dataSourceAfterEdit('mixed', ['title'])).toBe('mixed')
  })
})
