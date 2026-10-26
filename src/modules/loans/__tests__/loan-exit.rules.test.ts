import { describe, expect, it } from 'vitest'
import { activeLoanCountAfter } from '../rules/loan-exit.rules.js'

describe('vagas de empréstimo liberadas (activeLoanCountAfter)', () => {
  it('desconta as vagas liberadas', () => {
    expect(activeLoanCountAfter(5)).toBe(4)
    expect(activeLoanCountAfter(5, 3)).toBe(2)
  })

  it('nunca deixa o agregado negativo', () => {
    expect(activeLoanCountAfter(0)).toBe(0)
  })
})
