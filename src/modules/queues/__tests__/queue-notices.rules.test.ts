import { describe, expect, it } from 'vitest'
import { atLocalTime } from '../../../shared/calendar/dates.js'
import {
  addedByLibrarianNotice,
  movedUpNotice,
  otherEditionNotice,
  positionChangedNotice,
  removedByLibrarianNotice,
  turnMissedNotice,
  turnNotice,
} from '../rules/queue-notices.rules.js'
import { NOW } from './queue.fixtures.js'

const entry = {
  id: 'qe1',
  bookId: 'book1',
  bookTitle: 'Código Limpo',
  confirmDeadline: atLocalTime('2026-10-17', '09:12'),
}

describe('aviso "É a sua vez" (turnNotice, RF-FIL-06)', () => {
  it('diz até quando confirmar e leva o botão de confirmar', () => {
    expect(turnNotice(entry, NOW)).toEqual({
      type: 'queue_turn',
      title: 'É a sua vez: Código Limpo',
      body: 'Confirme até 17/10 às 09:12 que vai retirar.',
      bookId: 'book1',
      queueEntryId: 'qe1',
      action: 'confirm_turn',
      delivery: { push: 'skipped', email: 'skipped' },
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
})

describe('avisos de saída e de mudança na fila', () => {
  it('vez perdida (RF-FIL-07)', () => {
    expect(turnMissedNotice(entry, NOW)).toMatchObject({
      type: 'queue_turn_missed',
      title: 'Você perdeu a vez: Código Limpo',
      action: 'none',
    })
  })

  it('fila cancelada porque outra edição chegou primeiro (RF-FIL-04)', () => {
    expect(otherEditionNotice(entry, NOW)).toMatchObject({
      type: 'queue_cancelled_other_edition',
      title: 'Fila cancelada: Código Limpo',
      action: 'none',
    })
  })

  it('posição mudada pelo bibliotecário (RF-BAL-07)', () => {
    expect(positionChangedNotice(entry, 3, NOW)).toMatchObject({
      type: 'queue_position_changed',
      body: 'O balcão da biblioteca mudou a fila. Agora você é o 3º.',
    })
  })

  it('aluno adicionado pelo bibliotecário (RF-BAL-06)', () => {
    expect(addedByLibrarianNotice(entry, 2, NOW)).toMatchObject({
      type: 'queue_added_by_librarian',
      body: 'O balcão da biblioteca colocou você na fila, na posição 2.',
    })
  })

  it('aluno removido pelo bibliotecário, com o motivo (RF-BAL-06)', () => {
    expect(
      removedByLibrarianNotice(entry, 'Trancou o curso', NOW),
    ).toMatchObject({
      type: 'queue_removed_by_librarian',
      body: 'O balcão da biblioteca tirou você da fila. Motivo: Trancou o curso',
    })
  })

  it('todos ficam só dentro do app: push e e-mail pulados por enquanto', () => {
    for (const notice of [
      turnMissedNotice(entry, NOW),
      otherEditionNotice(entry, NOW),
      positionChangedNotice(entry, 1, NOW),
      addedByLibrarianNotice(entry, 1, NOW),
      removedByLibrarianNotice(entry, 'x', NOW),
    ]) {
      expect(notice.delivery).toEqual({ push: 'skipped', email: 'skipped' })
      expect(notice.readAt).toBeUndefined()
    }
  })
})

describe('aviso de que subiu na fila (movedUpNotice, RF-AVI-01)', () => {
  it('diz a posição nova, sem botão', () => {
    const notice = movedUpNotice(
      { id: 'qe3', bookId: 'book1', bookTitle: 'Código Limpo' },
      2,
      NOW,
    )

    expect(notice).toMatchObject({
      type: 'queue_moved_up',
      title: 'Você subiu na fila: Código Limpo',
      body: 'Agora você é o 2º da fila.',
      action: 'none',
      bookId: 'book1',
      queueEntryId: 'qe3',
      delivery: { push: 'skipped', email: 'skipped' },
    })
  })
})
