import { describe, expect, it } from 'vitest'
import { buildSearchText, searchTermsOf } from './search-text.js'

describe('texto de busca do livro (buildSearchText)', () => {
  it('junta título, subtítulo, autores, assuntos e ISBN, sem acento e em minúsculas', () => {
    expect(
      buildSearchText({
        title: 'Código Limpo',
        subtitle: 'habilidades práticas do agile software',
        authors: ['Robert C. Martin'],
        subjects: ['Desenvolvimento de software', 'Linguagem de programação'],
        isbn: '9788576082675',
      }),
    ).toBe(
      'codigo limpo habilidades praticas do agile software robert c. martin desenvolvimento de software linguagem de programacao 9788576082675',
    )
  })

  it('ignora o que o livro não tem (subtítulo e ISBN)', () => {
    expect(
      buildSearchText({
        title: 'Arquitetura Limpa',
        authors: ['Robert C. Martin'],
        subjects: [],
      }),
    ).toBe('arquitetura limpa robert c. martin')
  })

  it('normaliza os espaços repetidos e nas pontas', () => {
    expect(
      buildSearchText({
        title: '  Cálculo,   Vol. 1 ',
        authors: ['James  Stewart'],
        subjects: [' Matemática '],
      }),
    ).toBe('calculo, vol. 1 james stewart matematica')
  })
})

describe('termos da busca (searchTermsOf)', () => {
  it('normaliza o termo do mesmo jeito que o texto de busca', () => {
    expect(searchTermsOf('  CÓDIGO   Limpo ')).toEqual(['codigo', 'limpo'])
  })

  it('devolve a lista vazia para a busca vazia', () => {
    expect(searchTermsOf('   ')).toEqual([])
    expect(searchTermsOf('')).toEqual([])
  })
})
