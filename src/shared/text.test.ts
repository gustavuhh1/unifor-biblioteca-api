import { describe, expect, it } from 'vitest'
import { initialsOf, normalizeText } from './text.js'

describe('texto normalizado (normalizeText)', () => {
  it('passa para minúsculas e tira os acentos', () => {
    expect(normalizeText('João da Conceição')).toBe('joao da conceicao')
  })

  it('tira os espaços das pontas e junta os repetidos', () => {
    expect(normalizeText('  Código \t  Limpo  ')).toBe('codigo limpo')
  })
})

describe('iniciais do aluno (initialsOf)', () => {
  it('pega a primeira letra do primeiro e do último nome', () => {
    expect(initialsOf('Lucas Almeida')).toBe('LA')
    expect(initialsOf('Maria da Silva Souza')).toBe('MS')
    expect(initialsOf('álvaro ávila')).toBe('ÁÁ')
  })

  it('usa uma letra para um nome só', () => {
    expect(initialsOf('Lucas')).toBe('L')
  })
})
