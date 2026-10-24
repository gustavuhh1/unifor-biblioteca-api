import { describe, expect, it } from 'vitest'
import { matriculaSchema } from './matricula.js'

describe('matrícula (matriculaSchema)', () => {
  it('aceita exatamente sete dígitos', () => {
    expect(matriculaSchema.parse('2412858')).toBe('2412858')
    expect(matriculaSchema.parse(' 2513320 ')).toBe('2513320')
    expect(matriculaSchema.parse('0012345')).toBe('0012345')
  })

  it.each([
    '241285',
    '24128588',
    'abcdefg',
    '241285a',
    '241 2858',
    '',
    '-241285',
  ])('recusa %j', (matricula) => {
    expect(matriculaSchema.safeParse(matricula).success).toBe(false)
  })

  it('recusa um número que não é texto', () => {
    expect(matriculaSchema.safeParse(2412858).success).toBe(false)
  })
})
