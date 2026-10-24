import { describe, expect, it } from 'vitest'
import {
  activeQueueCountAfter,
  exitFields,
  fulfilledFields,
  isActiveEntry,
} from '../rules/queue-exit.rules.js'
import { NOW } from './queue.fixtures.js'

describe('lugar na fila ativa (isActiveEntry)', () => {
  it('waiting e your_turn estão na fila ativa', () => {
    expect(isActiveEntry({ status: 'waiting' })).toBe(true)
    expect(isActiveEntry({ status: 'your_turn' })).toBe(true)
  })

  it('os outros status já saíram da fila', () => {
    for (const status of [
      'fulfilled',
      'left',
      'missed',
      'removed',
      'cancelled_other_edition',
      'cancelled_book_removed',
    ] as const) {
      expect(isActiveEntry({ status })).toBe(false)
    }
  })
})

describe('o que gravar ao sair da fila (exitFields)', () => {
  it('o aluno saiu: só o status e a hora', () => {
    expect(exitFields('left', NOW)).toEqual({
      status: 'left',
      endedAt: NOW,
      updatedAt: NOW,
    })
  })

  it('o bibliotecário removeu: com o motivo e quem tirou', () => {
    expect(
      exitFields('removed', NOW, {
        reason: 'Aluno trancou o curso',
        endedBy: 'uid_ana',
      }),
    ).toEqual({
      status: 'removed',
      endedAt: NOW,
      endReason: 'Aluno trancou o curso',
      endedBy: 'uid_ana',
      updatedAt: NOW,
    })
  })

  it('perdeu a vez e outra edição chegou primeiro também saem pelo mesmo caminho', () => {
    expect(exitFields('missed', NOW).status).toBe('missed')
    expect(exitFields('cancelled_other_edition', NOW).status).toBe(
      'cancelled_other_edition',
    )
  })
})

describe('o lugar vira pedido (fulfilledFields, RF-FIL-06)', () => {
  it('fica fulfilled, ligado ao pedido criado', () => {
    expect(fulfilledFields('loan1', NOW)).toEqual({
      status: 'fulfilled',
      loanId: 'loan1',
      endedAt: NOW,
      updatedAt: NOW,
    })
  })
})

describe('vagas das 7 filas que voltam (activeQueueCountAfter)', () => {
  it('cada lugar que sai libera uma vaga', () => {
    expect(activeQueueCountAfter(5, 1)).toBe(4)
    expect(activeQueueCountAfter(5, 3)).toBe(2)
  })

  it('nunca fica abaixo de zero', () => {
    expect(activeQueueCountAfter(0, 1)).toBe(0)
  })
})
