import { describe, expect, it } from 'vitest'
import {
  dataSourceAfterEdit,
  dataSourceAfterSync,
  dataSourceForNewBook,
} from '../rules/data-source.rules.js'

const external = {
  title: 'Código Limpo',
  authors: ['Robert C. Martin'],
  publisher: 'Alta Books',
  synopsis: 'Sinopse das fontes.',
}

describe('origem dos dados de um livro novo (dataSourceForNewBook)', () => {
  it('é manual quando nenhuma fonte externa trouxe dados', () => {
    expect(dataSourceForNewBook({ external: undefined, book: external })).toBe(
      'manual',
    )
  })

  it('é external quando as fontes acharam e nada foi alterado à mão', () => {
    expect(dataSourceForNewBook({ external, book: { ...external } })).toBe(
      'external',
    )
  })

  it('é mixed quando o bibliotecário alterou título, autores, editora ou sinopse', () => {
    for (const changed of [
      { title: 'Código Limpo (2ª ed.)' },
      { authors: ['Robert Martin'] },
      { publisher: 'Outra' },
      { synopsis: 'Minha sinopse' },
    ]) {
      expect(
        dataSourceForNewBook({ external, book: { ...external, ...changed } }),
      ).toBe('mixed')
    }
  })

  it('é mixed quando o bibliotecário preencheu à mão o que as fontes não trouxeram', () => {
    expect(
      dataSourceForNewBook({
        external: { title: 'A', authors: ['B'] },
        book: { title: 'A', authors: ['B'], publisher: 'Preenchida à mão' },
      }),
    ).toBe('mixed')
  })

  it('continua external quando as fontes não trouxeram um campo e ele ficou vazio', () => {
    expect(
      dataSourceForNewBook({
        external: { title: 'A', authors: ['B'] },
        book: { title: 'A', authors: ['B'] },
      }),
    ).toBe('external')
  })
})

describe('origem dos dados depois da atualização (dataSourceAfterSync)', () => {
  it('é external quando as fontes trouxeram título, autores, editora e sinopse', () => {
    expect(dataSourceAfterSync(external)).toBe('external')
  })

  it('é mixed quando falta algum dos quatro (por exemplo, a sinopse)', () => {
    expect(
      dataSourceAfterSync({ title: 'A', authors: ['B'], publisher: 'C' }),
    ).toBe('mixed')
  })
})

describe('origem dos dados depois da edição (dataSourceAfterEdit)', () => {
  it('external vira mixed quando um campo de origem externa muda', () => {
    for (const field of [
      'title',
      'subtitle',
      'authors',
      'publisher',
      'year',
      'synopsis',
      'coverUrl',
      'subjects',
    ]) {
      expect(dataSourceAfterEdit('external', [field])).toBe('mixed')
    }
  })

  it('external continua quando só muda um campo do projeto ou o idioma', () => {
    expect(dataSourceAfterEdit('external', ['cdu', 'shelf'])).toBe('external')
    expect(dataSourceAfterEdit('external', ['language'])).toBe('external')
    expect(dataSourceAfterEdit('external', [])).toBe('external')
  })

  it('manual continua manual e mixed continua mixed', () => {
    expect(dataSourceAfterEdit('manual', ['title'])).toBe('manual')
    expect(dataSourceAfterEdit('mixed', ['title'])).toBe('mixed')
  })
})
