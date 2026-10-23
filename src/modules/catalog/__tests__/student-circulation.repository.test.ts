import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { readStudentCirculation } =
  await import('../repositories/student-circulation.repository.js')

const DUE = new Date('2026-10-20T00:55:00Z')

beforeEach(() => {
  h.db = new Fake()
})

describe('dados do aluno para a elegibilidade (readStudentCirculation)', () => {
  it('lê os contadores e os pedidos e empréstimos em andamento do aluno', async () => {
    h.db.put('users', 'uid_lucas', { activeLoanCount: 4, activeQueueCount: 1 })
    h.db.put('loans', 'l1', {
      studentUid: 'uid_lucas',
      workId: 'redes--tanenbaum',
      status: 'active',
      dueAt: DUE,
    })
    h.db.put('loans', 'l2', {
      studentUid: 'uid_lucas',
      workId: 'codigo-limpo--martin',
      status: 'awaiting_pickup',
      pickupDeadline: DUE,
    })

    const result = await readStudentCirculation('uid_lucas')

    expect(result).toMatchObject({ activeLoanCount: 4, activeQueueCount: 1 })
    expect(result.openLoans).toEqual(
      expect.arrayContaining([
        { workId: 'redes--tanenbaum', status: 'active', dueAt: DUE },
        {
          workId: 'codigo-limpo--martin',
          status: 'awaiting_pickup',
          dueAt: undefined,
        },
      ]),
    )
    expect(result.openLoans).toHaveLength(2)
  })

  it('ignora empréstimos devolvidos, cancelados, expirados e de outros alunos', async () => {
    h.db.put('users', 'uid_lucas', { activeLoanCount: 0, activeQueueCount: 0 })
    for (const status of ['returned', 'cancelled', 'expired']) {
      h.db.put('loans', `l_${status}`, {
        studentUid: 'uid_lucas',
        workId: 'x',
        status,
      })
    }
    h.db.put('loans', 'l_outro', {
      studentUid: 'uid_marina',
      workId: 'x',
      status: 'active',
      dueAt: DUE,
    })

    expect((await readStudentCirculation('uid_lucas')).openLoans).toEqual([])
  })

  it('conta zero para aluno sem documento', async () => {
    expect(await readStudentCirculation('uid_novo')).toEqual({
      activeLoanCount: 0,
      activeQueueCount: 0,
      openLoans: [],
    })
  })
})
