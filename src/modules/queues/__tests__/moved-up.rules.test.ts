import { describe, expect, it } from 'vitest'
import { movedUpAfterExit } from '../rules/moved-up.rules.js'
import { makeQueue } from './queue.fixtures.js'

const ids = (moved: ReturnType<typeof movedUpAfterExit>) =>
  moved.map(({ entry, position }) => [entry.id, position])

describe('quem sobe na fila quando alguém sai (movedUpAfterExit, RF-AVI-01)', () => {
  it('quem está atrás sobe uma posição, com a posição nova', () => {
    // Fila: qe1, qe2, qe3, qe4. O qe2 sai: qe3 passa a 2º e qe4 a 3º.
    expect(ids(movedUpAfterExit(makeQueue(), 'qe2'))).toEqual([
      ['qe3', 2],
      ['qe4', 3],
    ])
  })

  it('quem está à frente não é avisado', () => {
    const moved = movedUpAfterExit(makeQueue(), 'qe3')

    expect(moved.map(({ entry }) => entry.id)).not.toContain('qe1')
    expect(moved.map(({ entry }) => entry.id)).not.toContain('qe2')
  })

  it('quando o 1º sai, todos os outros sobem', () => {
    expect(ids(movedUpAfterExit(makeQueue(), 'qe1'))).toEqual([
      ['qe2', 1],
      ['qe3', 2],
      ['qe4', 3],
    ])
  })

  it('o último a sair não faz ninguém subir', () => {
    expect(movedUpAfterExit(makeQueue(), 'qe4')).toEqual([])
  })

  it('não avisa quem ganhou a vez, que recebe "É a sua vez"', () => {
    const moved = movedUpAfterExit(makeQueue(), 'qe1', new Set(['qe2']))

    expect(ids(moved)).toEqual([
      ['qe3', 2],
      ['qe4', 3],
    ])
  })

  it('lugar que não está na fila ativa não avisa ninguém', () => {
    expect(movedUpAfterExit(makeQueue(), 'qe99')).toEqual([])
  })

  it('fila sem ninguém: lista vazia', () => {
    expect(movedUpAfterExit([], 'qe1')).toEqual([])
  })
})
