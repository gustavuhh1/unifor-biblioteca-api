import { describe, expect, it } from 'vitest'
import { initialsOf, normalizeText } from './text.js'

describe('normalizeText', () => {
  it('lower-cases and removes accents', () => {
    expect(normalizeText('João da Conceição')).toBe('joao da conceicao')
  })
})

describe('initialsOf', () => {
  it('takes the first letter of the first and of the last name', () => {
    expect(initialsOf('Lucas Almeida')).toBe('LA')
    expect(initialsOf('Maria da Silva Souza')).toBe('MS')
    expect(initialsOf('álvaro ávila')).toBe('ÁÁ')
  })

  it('uses one letter for a single name', () => {
    expect(initialsOf('Lucas')).toBe('L')
  })
})
