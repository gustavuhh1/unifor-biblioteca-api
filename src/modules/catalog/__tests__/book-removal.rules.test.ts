import { describe, expect, it } from 'vitest'
import { canRemoveBook } from '../rules/book-removal.rules.js'

const copy = (status: 'available' | 'reserved' | 'on_loan' | 'withdrawn') => ({
  status,
})

describe('remoção do livro (canRemoveBook)', () => {
  it('permite remover sem exemplar reservado ou emprestado e sem fila', () => {
    expect(
      canRemoveBook({ queueLength: 0 }, [copy('available'), copy('available')]),
    ).toBe(true)
  })

  it('permite remover com exemplares já retirados do acervo', () => {
    expect(
      canRemoveBook({ queueLength: 0 }, [copy('withdrawn'), copy('available')]),
    ).toBe(true)
  })

  it('bloqueia com um exemplar reservado', () => {
    expect(
      canRemoveBook({ queueLength: 0 }, [copy('available'), copy('reserved')]),
    ).toBe(false)
  })

  it('bloqueia com um exemplar emprestado', () => {
    expect(canRemoveBook({ queueLength: 0 }, [copy('on_loan')])).toBe(false)
  })

  it('bloqueia com gente na fila, mesmo com todos os exemplares na estante', () => {
    expect(canRemoveBook({ queueLength: 1 }, [copy('available')])).toBe(false)
  })

  it('permite remover um livro sem exemplares e sem fila', () => {
    expect(canRemoveBook({ queueLength: 0 }, [])).toBe(true)
  })
})
