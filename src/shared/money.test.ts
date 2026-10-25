import { describe, expect, it } from 'vitest'
import { formatMoney } from './money.js'

describe('dinheiro em reais (formatMoney)', () => {
  it('escreve os centavos com vírgula', () => {
    expect(formatMoney(600)).toBe('R$ 6,00')
    expect(formatMoney(2800)).toBe('R$ 28,00')
    expect(formatMoney(5)).toBe('R$ 0,05')
    expect(formatMoney(0)).toBe('R$ 0,00')
  })
})
