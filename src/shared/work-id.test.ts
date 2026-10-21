import { describe, expect, it } from 'vitest'
import { workIdOf } from './work-id.js'

describe('ID da obra (workIdOf)', () => {
  it('junta o slug do título e o sobrenome do primeiro autor', () => {
    expect(workIdOf('Código Limpo', ['Robert C. Martin'])).toBe(
      'codigo-limpo--martin',
    )
  })

  it('tira acentos e pontuação do título e do sobrenome', () => {
    expect(workIdOf('Cálculo, Vol. 1', ['James Stewart'])).toBe(
      'calculo-vol-1--stewart',
    )
    expect(workIdOf('Programação: Técnicas & Práticas!', ['José D’Ávila'])).toBe(
      'programacao-tecnicas-praticas--d-avila',
    )
  })

  it('usa só o primeiro autor', () => {
    expect(workIdOf('Algoritmos', ['Thomas H. Cormen', 'Charles Leiserson'])).toBe(
      'algoritmos--cormen',
    )
  })

  it('entende o formato "Sobrenome, Nome"', () => {
    expect(workIdOf('Refatoração', ['Fowler, Martin'])).toBe(
      'refatoracao--fowler',
    )
  })

  it('devolve só o slug do título quando não há autor', () => {
    expect(workIdOf('Anatomia Humana', [])).toBe('anatomia-humana')
  })

  it('dá o mesmo ID para o mesmo título e autor, qualquer que seja a caixa', () => {
    expect(workIdOf('CÓDIGO   LIMPO', ['robert c. martin'])).toBe(
      workIdOf('Código Limpo', ['Robert C. Martin']),
    )
  })
})
