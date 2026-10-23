import { describe, expect, it } from 'vitest'
import {
  cleanList,
  cleanText,
  omitUndefined,
  secureUrl,
  stripHtml,
  yearOf,
} from '../rules/metadata-text.rules.js'

describe('sinopse sem HTML (stripHtml)', () => {
  it('tira as tags e mantém o texto', () => {
    expect(stripHtml('<p>Um <b>ótimo</b> livro.</p>')).toBe('Um ótimo livro.')
  })

  it('transforma <br> e fim de parágrafo em quebra de linha', () => {
    expect(stripHtml('<p>Primeiro.</p><p>Segundo.<br>Terceiro.</p>')).toBe(
      'Primeiro.\nSegundo.\nTerceiro.',
    )
  })

  it('troca as entidades HTML mais comuns', () => {
    expect(
      stripHtml('Tom &amp; Jerry &quot;juntos&quot; &#39;sempre&#39;'),
    ).toBe('Tom & Jerry "juntos" \'sempre\'')
  })
})

describe('limpeza de texto (cleanText)', () => {
  it('tira os espaços das pontas', () => {
    expect(cleanText('  Código Limpo ')).toBe('Código Limpo')
  })

  it('texto vazio, em branco, nulo ou ausente vira undefined', () => {
    expect(cleanText('')).toBeUndefined()
    expect(cleanText('   ')).toBeUndefined()
    expect(cleanText(null)).toBeUndefined()
    expect(cleanText(undefined)).toBeUndefined()
  })
})

describe('limpeza de lista (cleanList)', () => {
  it('tira espaços, itens vazios e repetições, mantendo a ordem', () => {
    expect(cleanList([' Literatura ', 'Literatura', '', 'Romance'])).toEqual([
      'Literatura',
      'Romance',
    ])
  })

  it('limita o número de itens', () => {
    expect(cleanList(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b'])
  })

  it('lista vazia, nula ou ausente vira undefined', () => {
    expect(cleanList([])).toBeUndefined()
    expect(cleanList(['', ' '])).toBeUndefined()
    expect(cleanList(null)).toBeUndefined()
    expect(cleanList(undefined)).toBeUndefined()
  })
})

describe('ano de publicação (yearOf)', () => {
  it('lê o ano em qualquer formato de data em texto livre', () => {
    expect(yearOf('2009')).toBe(2009)
    expect(yearOf('July 2008')).toBe(2008)
    expect(yearOf('Oct 15, 2013')).toBe(2013)
    expect(yearOf('2012-05-01')).toBe(2012)
  })

  it('aceita o número que a BrasilAPI manda', () => {
    expect(yearOf(2009)).toBe(2009)
  })

  it('sem ano de quatro dígitos devolve undefined', () => {
    expect(yearOf('sem data')).toBeUndefined()
    expect(yearOf('')).toBeUndefined()
    expect(yearOf(null)).toBeUndefined()
    expect(yearOf(undefined)).toBeUndefined()
  })
})

describe('endereço da capa (secureUrl)', () => {
  it('troca http por https', () => {
    expect(secureUrl('http://covers.example/c.jpg')).toBe(
      'https://covers.example/c.jpg',
    )
  })

  it('mantém o https e devolve undefined para vazio ou nulo', () => {
    expect(secureUrl('https://covers.example/c.jpg')).toBe(
      'https://covers.example/c.jpg',
    )
    expect(secureUrl('  ')).toBeUndefined()
    expect(secureUrl(null)).toBeUndefined()
  })
})

describe('campos sem valor (omitUndefined)', () => {
  it('tira só o que é undefined', () => {
    expect(omitUndefined({ a: 1, b: undefined, c: 0, d: '' })).toEqual({
      a: 1,
      c: 0,
      d: '',
    })
  })
})
