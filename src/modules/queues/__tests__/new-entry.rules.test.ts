import { describe, expect, it } from 'vitest'
import { buildNewEntry } from '../rules/new-entry.rules.js'
import { NOW } from './queue.fixtures.js'

const input = {
  book: {
    id: 'book1',
    workId: 'codigo-limpo--martin',
    title: 'Código Limpo',
  },
  student: { uid: 'uid_lucas', matricula: '2412858', name: 'Lucas Almeida' },
  order: 3000,
  origin: 'student' as const,
  at: NOW,
}

describe('lugar de quem entra na fila (buildNewEntry, RF-FIL-02)', () => {
  it('nasce na espera, com o aluno e a edição copiados', () => {
    expect(buildNewEntry(input)).toEqual({
      bookId: 'book1',
      workId: 'codigo-limpo--martin',
      bookTitle: 'Código Limpo',
      studentUid: 'uid_lucas',
      matricula: '2412858',
      studentName: 'Lucas Almeida',
      status: 'waiting',
      order: 3000,
      joinedAt: NOW,
      origin: 'student',
      notifyCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })

  it('edições marcadas juntas levam o mesmo grupo (RF-FIL-04)', () => {
    expect(
      buildNewEntry({ ...input, editionGroupId: 'grupo1' }).editionGroupId,
    ).toBe('grupo1')
  })

  it('o bibliotecário que colocou o aluno fica registrado com o motivo (RF-BAL-06)', () => {
    expect(
      buildNewEntry({
        ...input,
        origin: 'librarian',
        addedBy: 'uid_ana',
        addReason: 'Pediu no balcão',
      }),
    ).toMatchObject({
      origin: 'librarian',
      addedBy: 'uid_ana',
      addReason: 'Pediu no balcão',
    })
  })

  it('sem grupo, bibliotecário nem motivo, esses campos não existem no documento', () => {
    const entry = buildNewEntry(input)

    expect(entry).not.toHaveProperty('editionGroupId')
    expect(entry).not.toHaveProperty('addedBy')
    expect(entry).not.toHaveProperty('addReason')
  })
})
