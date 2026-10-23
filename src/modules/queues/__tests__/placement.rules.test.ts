import { describe, expect, it } from 'vitest'
import {
  nextOrderAtEnd,
  passesAhead,
  planPlacement,
  type QueueSlot,
} from '../rules/placement.rules.js'

// A fila do Arquitetura Limpa (seção 6.3): Ana Beatriz, Lucas, Carlos e Marina.
const queue: QueueSlot[] = [
  { id: 'ana', order: 1000, status: 'waiting' },
  { id: 'lucas', order: 2000, status: 'waiting' },
  { id: 'carlos', order: 3000, status: 'waiting' },
  { id: 'marina', order: 4000, status: 'waiting' },
]

// Mesma fila com a Ana Beatriz na vez (exemplar já guardado para ela).
const queueWithTurn: QueueSlot[] = [
  { ...queue[0]!, status: 'your_turn' },
  ...queue.slice(1),
]

function place(input: Parameters<typeof planPlacement>[0]) {
  const result = planPlacement(input)
  if (!result.ok) throw new Error(`recusado: ${result.refusal}`)
  return result.placement
}

describe('adicionar alguém no fim da fila (RF-BAL-06)', () => {
  it('vai para o fim sem passar ninguém, então não pede confirmação', () => {
    const placement = place({ queue, position: 5 })

    expect(placement).toEqual({
      position: 5,
      order: 5000,
      renumbered: [],
      movedDown: [],
    })
    expect(passesAhead(placement)).toBe(false)
  })

  it('numa fila vazia ganha o primeiro passo', () => {
    expect(place({ queue: [], position: 1 }).order).toBe(1000)
  })
})

describe('passar à frente de outros (RF-BAL-07)', () => {
  it('entrar na posição 2 faz descer quem estava do 2 em diante', () => {
    const placement = place({ queue, position: 2 })

    expect(placement.order).toBe(1500)
    expect(placement.movedDown).toEqual([
      { entryId: 'lucas', fromPosition: 2, toPosition: 3 },
      { entryId: 'carlos', fromPosition: 3, toPosition: 4 },
      { entryId: 'marina', fromPosition: 4, toPosition: 5 },
    ])
    expect(passesAhead(placement)).toBe(true)
  })

  it('mover a Marina para a frente lista quem desce, só até a posição dela', () => {
    const placement = place({ queue, entryId: 'marina', position: 2 })

    expect(placement.order).toBe(1500)
    expect(placement.movedDown).toEqual([
      { entryId: 'lucas', fromPosition: 2, toPosition: 3 },
      { entryId: 'carlos', fromPosition: 3, toPosition: 4 },
    ])
    expect(passesAhead(placement)).toBe(true)
  })

  it('passar para a posição 1 usa a metade da primeira ordem', () => {
    const placement = place({ queue, entryId: 'carlos', position: 1 })

    expect(placement.order).toBe(500)
    expect(placement.movedDown.map((moved) => moved.entryId)).toEqual([
      'ana',
      'lucas',
    ])
  })

  it('mover um passo à frente faz descer só o vizinho', () => {
    expect(place({ queue, entryId: 'carlos', position: 2 }).movedDown).toEqual([
      { entryId: 'lucas', fromPosition: 2, toPosition: 3 },
    ])
  })
})

describe('mover para trás (RF-BAL-07)', () => {
  it('não faz ninguém descer, então não pede confirmação', () => {
    const placement = place({ queue, entryId: 'ana', position: 3 })

    expect(placement.order).toBe(3500)
    expect(placement.movedDown).toEqual([])
    expect(passesAhead(placement)).toBe(false)
  })

  it('mover para o fim fica depois do último', () => {
    const placement = place({ queue, entryId: 'lucas', position: 4 })

    expect(placement).toMatchObject({
      position: 4,
      order: 5000,
      movedDown: [],
    })
  })
})

describe('posições recusadas', () => {
  it('posição depois do fim da fila (invalid_position)', () => {
    expect(planPlacement({ queue, position: 6 })).toEqual({
      ok: false,
      refusal: 'invalid_position',
    })
    expect(planPlacement({ queue, entryId: 'ana', position: 5 })).toEqual({
      ok: false,
      refusal: 'invalid_position',
    })
  })

  it('posição zero ou negativa (invalid_position)', () => {
    expect(planPlacement({ queue, position: 0 })).toEqual({
      ok: false,
      refusal: 'invalid_position',
    })
  })

  it('já está na posição pedida (same_position)', () => {
    expect(planPlacement({ queue, entryId: 'lucas', position: 2 })).toEqual({
      ok: false,
      refusal: 'same_position',
    })
  })

  it('quem está na vez não se move (turn_in_progress)', () => {
    expect(
      planPlacement({ queue: queueWithTurn, entryId: 'ana', position: 3 }),
    ).toEqual({ ok: false, refusal: 'turn_in_progress' })
  })

  it('ninguém passa à frente de quem está na vez (invalid_position)', () => {
    expect(
      planPlacement({ queue: queueWithTurn, entryId: 'marina', position: 1 }),
    ).toEqual({ ok: false, refusal: 'invalid_position' })
    expect(planPlacement({ queue: queueWithTurn, position: 1 })).toEqual({
      ok: false,
      refusal: 'invalid_position',
    })
  })

  it('logo depois de quem está na vez pode', () => {
    const placement = place({
      queue: queueWithTurn,
      entryId: 'marina',
      position: 2,
    })

    expect(placement.order).toBe(1500)
    expect(placement.movedDown.map((moved) => moved.entryId)).toEqual([
      'lucas',
      'carlos',
    ])
  })
})

describe('sem valor livre entre os vizinhos', () => {
  const tight: QueueSlot[] = [
    { id: 'a', order: 1, status: 'waiting' },
    { id: 'b', order: 1 + Number.EPSILON, status: 'waiting' },
    { id: 'c', order: 5000, status: 'waiting' },
  ]

  it('renumera a fila toda de 1000 em 1000', () => {
    const placement = place({ queue: tight, entryId: 'c', position: 2 })

    expect(placement.order).toBe(2000)
    expect(placement.renumbered).toEqual([
      { entryId: 'a', order: 1000 },
      { entryId: 'b', order: 3000 },
    ])
  })
})

describe('ordem de quem entra no fim (nextOrderAtEnd)', () => {
  it('é o maior order da fila mais 1000', () => {
    expect(nextOrderAtEnd(queue)).toBe(5000)
  })

  it('numa fila vazia é 1000', () => {
    expect(nextOrderAtEnd([])).toBe(1000)
  })
})
