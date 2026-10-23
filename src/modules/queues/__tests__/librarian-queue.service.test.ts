import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { getLibrarianQueue } =
  await import('../services/librarian-queue.service.js')
const { addToQueue } = await import('../services/queue-add.service.js')
const { moveQueueEntry } = await import('../services/queue-move.service.js')
const { removeFromQueue } = await import('../services/queue-remove.service.js')
const { resendTurnNotice } = await import('../services/queue-resend.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeLoan } = await import('../../loans/__tests__/loan.fixtures.js')
const {
  LIBRARIAN_UID,
  NOW,
  catchError,
  putBook,
  putCopy,
  putEntry,
  putLibrarian,
  putStudent,
} = await import('./queue.fixtures.js')

const DEADLINE = atLocalTime('2026-10-17', '09:12')

// A fila do Arquitetura Limpa (seção 6.3): Ana Beatriz, Lucas, Carlos e Marina,
// mais a Beatriz (2311052) fora da fila, para o bibliotecário adicionar.
beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  h.db.put('holidays', '2026', { items: [] })
  putLibrarian(h.db)
  const students: Array<[string, string, string]> = [
    ['uid_ana_beatriz', 'Ana Beatriz Lima', '2311001'],
    ['uid_lucas', 'Lucas Almeida', '2412858'],
    ['uid_carlos', 'Carlos Eduardo Sá', '2210001'],
    ['uid_marina', 'Marina Castro', '2513320'],
    ['uid_beatriz', 'Beatriz Nogueira', '2311052'],
  ]
  for (const [uid, fullName, matricula] of students) {
    putStudent(h.db, uid, {
      fullName,
      matricula,
      activeQueueCount: uid === 'uid_beatriz' ? 0 : 1,
    })
  }
  putBook(h.db, 'book1', { queueLength: 4, title: 'Arquitetura Limpa' })
  putCopy(h.db, 'copy1')
  ;(
    [
      ['qe1', 'uid_ana_beatriz', 'Ana Beatriz Lima', '2311001', 1000],
      ['qe2', 'uid_lucas', 'Lucas Almeida', '2412858', 2000],
      ['qe3', 'uid_carlos', 'Carlos Eduardo Sá', '2210001', 3000],
      ['qe4', 'uid_marina', 'Marina Castro', '2513320', 4000],
    ] as const
  ).forEach(([id, uid, studentName, matricula, order]) =>
    putEntry(h.db, id, {
      bookTitle: 'Arquitetura Limpa',
      studentUid: uid,
      studentName,
      matricula,
      order,
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

const positions = async () =>
  (await getLibrarianQueue('book1')).items.map(
    (item) => `${item.position}:${item.matricula}`,
  )

describe('ver a fila de um livro (getLibrarianQueue, RF-BAL-06)', () => {
  it('lista a fila na ordem real, com nome e matrícula', async () => {
    const queue = await getLibrarianQueue('book1')

    expect(queue.book).toMatchObject({
      id: 'book1',
      title: 'Arquitetura Limpa',
      copiesAvailable: 0,
    })
    expect(queue.items.map((item) => item.studentName)).toEqual([
      'Ana Beatriz Lima',
      'Lucas Almeida',
      'Carlos Eduardo Sá',
      'Marina Castro',
    ])
    expect(queue.items[0]).toMatchObject({
      position: 1,
      status: 'waiting',
      origin: 'student',
      notifyCount: 0,
    })
  })

  it('só lista quem está na fila ativa', async () => {
    putEntry(h.db, 'qe9', { studentUid: 'x', order: 500, status: 'left' })

    expect((await getLibrarianQueue('book1')).items).toHaveLength(4)
  })

  it('livro que não existe ou foi removido devolve 404', async () => {
    putBook(h.db, 'removido', { status: 'removed' })

    expect(await catchError(getLibrarianQueue('nao-existe'))).toMatchObject({
      status: 404,
      code: 'book_not_found',
    })
    expect(await catchError(getLibrarianQueue('removido'))).toMatchObject({
      status: 404,
    })
  })
})

describe('adicionar aluno no fim da fila (addToQueue, RF-BAL-06)', () => {
  it('vai para o fim sem confirmação nem motivo', async () => {
    const change = await addToQueue(LIBRARIAN_UID, 'book1', {
      matricula: '2311052',
      confirmed: false,
    })

    expect(change).toMatchObject({ applied: true, movedDown: [] })
    expect(change.queue?.items.at(-1)).toMatchObject({
      position: 5,
      matricula: '2311052',
      origin: 'librarian',
    })
  })

  it('registra quem adicionou, o motivo (se houver) e atualiza os contadores', async () => {
    await addToQueue(LIBRARIAN_UID, 'book1', {
      matricula: '2311052',
      reason: 'Pediu no balcão',
      confirmed: false,
    })

    const [entry] = h.db
      .all('queueEntries')
      .filter((e) => e.studentUid === 'uid_beatriz')
    expect(entry).toMatchObject({
      status: 'waiting',
      order: 5000,
      origin: 'librarian',
      addedBy: LIBRARIAN_UID,
      addReason: 'Pediu no balcão',
      joinedAt: NOW,
    })
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 5 })
    expect(h.db.read('users', 'uid_beatriz')).toMatchObject({
      activeQueueCount: 1,
    })
  })

  it('avisa o aluno e grava o auditLog queue_add', async () => {
    await addToQueue(LIBRARIAN_UID, 'book1', {
      matricula: '2311052',
      confirmed: false,
    })

    expect(h.db.all('users/uid_beatriz/notifications')[0]).toMatchObject({
      type: 'queue_added_by_librarian',
      body: 'O balcão da biblioteca colocou você na fila, na posição 5.',
    })
    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN_UID,
        actorRole: 'librarian',
        action: 'queue_add',
        targetUid: 'uid_beatriz',
        bookId: 'book1',
        details: { position: 5, movedDown: [] },
        createdAt: NOW,
      }),
    ])
  })
})

describe('adicionar à frente de outros pede confirmação (RF-BAL-07)', () => {
  const ahead = { matricula: '2311052', position: 2 }

  it('sem confirmar, não grava nada e lista quem desce', async () => {
    const change = await addToQueue(LIBRARIAN_UID, 'book1', {
      ...ahead,
      confirmed: false,
    })

    expect(change.applied).toBe(false)
    expect(change.queue).toBeNull()
    expect(change.movedDown).toEqual([
      {
        entryId: 'qe2',
        studentName: 'Lucas Almeida',
        matricula: '2412858',
        fromPosition: 2,
        toPosition: 3,
      },
      {
        entryId: 'qe3',
        studentName: 'Carlos Eduardo Sá',
        matricula: '2210001',
        fromPosition: 3,
        toPosition: 4,
      },
      {
        entryId: 'qe4',
        studentName: 'Marina Castro',
        matricula: '2513320',
        fromPosition: 4,
        toPosition: 5,
      },
    ])
    expect(h.db.all('queueEntries')).toHaveLength(4)
    expect(h.db.all('auditLog')).toHaveLength(0)
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 4 })
  })

  it('confirmado, sem motivo: 400 reason_required', async () => {
    const error = await catchError(
      addToQueue(LIBRARIAN_UID, 'book1', { ...ahead, confirmed: true }),
    )

    expect(error).toMatchObject({
      status: 400,
      code: 'reason_required',
      extra: { fields: [expect.objectContaining({ field: 'reason' })] },
    })
    expect(h.db.all('queueEntries')).toHaveLength(4)
  })

  it('confirmado e com motivo: entra na posição 2 e todos os de trás descem', async () => {
    const change = await addToQueue(LIBRARIAN_UID, 'book1', {
      ...ahead,
      reason: 'Pediu no balcão com a carteirinha',
      confirmed: true,
    })

    expect(change.applied).toBe(true)
    expect(await positions()).toEqual([
      '1:2311001',
      '2:2311052',
      '3:2412858',
      '4:2210001',
      '5:2513320',
    ])
  })

  it('avisa quem desceu (queue_position_changed) e registra quem desceu no auditLog', async () => {
    await addToQueue(LIBRARIAN_UID, 'book1', {
      ...ahead,
      reason: 'Pediu no balcão',
      confirmed: true,
    })

    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'queue_position_changed',
      body: 'O balcão da biblioteca mudou a fila. Agora você é o 3º.',
    })
    expect(h.db.all('users/uid_ana_beatriz/notifications')).toHaveLength(0)
    expect(h.db.all('auditLog')[0]).toMatchObject({
      action: 'queue_add',
      reason: 'Pediu no balcão',
      details: {
        position: 2,
        movedDown: ['uid_lucas', 'uid_carlos', 'uid_marina'],
      },
    })
  })

  it('posição 1 usa a metade da primeira ordem e fica na frente de todos', async () => {
    await addToQueue(LIBRARIAN_UID, 'book1', {
      matricula: '2311052',
      position: 1,
      reason: 'Urgência da disciplina',
      confirmed: true,
    })

    expect((await positions())[0]).toBe('1:2311052')
  })
})

describe('quem o bibliotecário não consegue adicionar', () => {
  const add = (matricula: string) =>
    addToQueue(LIBRARIAN_UID, 'book1', { matricula, confirmed: false })

  it('matrícula que não é de aluno devolve 404 student_not_found', async () => {
    expect(await catchError(add('9999999'))).toMatchObject({
      status: 404,
      code: 'student_not_found',
    })
    expect(await catchError(add('1000001'))).toMatchObject({
      status: 404,
      code: 'student_not_found',
    })
  })

  it('aluno que já está na fila devolve 409 already_in_queue', async () => {
    expect(await catchError(add('2412858'))).toMatchObject({
      status: 409,
      code: 'already_in_queue',
    })
  })

  it('aluno no limite de 7 filas devolve 409 queue_limit', async () => {
    putStudent(h.db, 'uid_beatriz', {
      fullName: 'Beatriz Nogueira',
      matricula: '2311052',
      activeQueueCount: 7,
    })

    expect(await catchError(add('2311052'))).toMatchObject({
      status: 409,
      code: 'queue_limit',
    })
  })

  it('aluno com empréstimo atrasado devolve 409 overdue', async () => {
    h.db.put(
      'loans',
      'loan9',
      makeLoan({
        studentUid: 'uid_beatriz',
        bookId: 'outro',
        workId: 'outro--autor',
        status: 'active',
        dueAt: atLocalTime('2026-10-14', '21:55'),
      }),
    )

    expect(await catchError(add('2311052'))).toMatchObject({
      status: 409,
      code: 'overdue',
    })
  })

  it('livro com exemplar disponível devolve 409 not_queueable', async () => {
    putBook(h.db, 'book1', { copiesAvailable: 1 })

    expect(await catchError(add('2311052'))).toMatchObject({
      status: 409,
      code: 'not_queueable',
    })
  })

  it('posição depois do fim devolve 409 invalid_position', async () => {
    expect(
      await catchError(
        addToQueue(LIBRARIAN_UID, 'book1', {
          matricula: '2311052',
          position: 9,
          confirmed: false,
        }),
      ),
    ).toMatchObject({ status: 409, code: 'invalid_position' })
  })

  it('livro que não existe devolve 404', async () => {
    expect(
      await catchError(
        addToQueue(LIBRARIAN_UID, 'nao-existe', {
          matricula: '2311052',
          confirmed: false,
        }),
      ),
    ).toMatchObject({ status: 404, code: 'book_not_found' })
  })
})

describe('mudar a posição (moveQueueEntry, RF-BAL-06, RF-BAL-07)', () => {
  it('para o fim da fila não pede confirmação nem motivo', async () => {
    const change = await moveQueueEntry(LIBRARIAN_UID, 'qe1', {
      position: 4,
      confirmed: false,
    })

    expect(change.applied).toBe(true)
    expect(change.movedDown).toEqual([])
    expect(await positions()).toEqual([
      '1:2412858',
      '2:2210001',
      '3:2513320',
      '4:2311001',
    ])
  })

  it('para trás, o aluno movido é avisado e ninguém mais', async () => {
    await moveQueueEntry(LIBRARIAN_UID, 'qe1', {
      position: 4,
      confirmed: false,
    })

    expect(h.db.all('users/uid_ana_beatriz/notifications')[0]).toMatchObject({
      type: 'queue_position_changed',
      body: 'O balcão da biblioteca mudou a fila. Agora você é o 4º.',
    })
    expect(h.db.all('users/uid_lucas/notifications')).toHaveLength(0)
  })

  it('passando à frente, sem confirmar: não grava e lista quem desce', async () => {
    const change = await moveQueueEntry(LIBRARIAN_UID, 'qe4', {
      position: 2,
      confirmed: false,
    })

    expect(change).toMatchObject({ applied: false, queue: null })
    expect(change.movedDown.map((moved) => moved.matricula)).toEqual([
      '2412858',
      '2210001',
    ])
    expect(await positions()).toEqual([
      '1:2311001',
      '2:2412858',
      '3:2210001',
      '4:2513320',
    ])
    expect(h.db.all('auditLog')).toHaveLength(0)
  })

  it('passando à frente, confirmado sem motivo: 400 reason_required', async () => {
    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'qe4', { position: 2, confirmed: true }),
      ),
    ).toMatchObject({ status: 400, code: 'reason_required' })
  })

  it('passando à frente, confirmado e com motivo: muda, avisa quem desceu e grava o auditLog', async () => {
    const change = await moveQueueEntry(LIBRARIAN_UID, 'qe4', {
      position: 2,
      reason: 'Entrega do TCC amanhã',
      confirmed: true,
    })

    expect(change.applied).toBe(true)
    expect(await positions()).toEqual([
      '1:2311001',
      '2:2513320',
      '3:2412858',
      '4:2210001',
    ])
    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'queue_position_changed',
      body: 'O balcão da biblioteca mudou a fila. Agora você é o 3º.',
    })
    expect(h.db.all('users/uid_marina/notifications')[0]).toMatchObject({
      type: 'queue_position_changed',
      body: 'O balcão da biblioteca mudou a fila. Agora você é o 2º.',
    })
    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN_UID,
        actorRole: 'librarian',
        action: 'queue_move',
        targetUid: 'uid_marina',
        bookId: 'book1',
        entityId: 'qe4',
        reason: 'Entrega do TCC amanhã',
        details: { from: 4, to: 2, movedDown: ['uid_lucas', 'uid_carlos'] },
      }),
    ])
  })

  it('o book não muda de tamanho e o lugar guarda um order entre os vizinhos', async () => {
    await moveQueueEntry(LIBRARIAN_UID, 'qe4', {
      position: 2,
      reason: 'Entrega do TCC amanhã',
      confirmed: true,
    })

    expect(h.db.read('queueEntries', 'qe4')).toMatchObject({ order: 1500 })
    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 4 })
  })

  it('já na posição pedida devolve 409 same_position', async () => {
    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'qe2', { position: 2, confirmed: false }),
      ),
    ).toMatchObject({ status: 409, code: 'same_position' })
  })

  it('posição que não existe devolve 409 invalid_position', async () => {
    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'qe2', { position: 5, confirmed: false }),
      ),
    ).toMatchObject({ status: 409, code: 'invalid_position' })
  })

  it('quem está na vez não se move (409 turn_in_progress) e ninguém passa à frente dele', async () => {
    putEntry(h.db, 'qe1', {
      bookTitle: 'Arquitetura Limpa',
      studentUid: 'uid_ana_beatriz',
      studentName: 'Ana Beatriz Lima',
      matricula: '2311001',
      order: 1000,
      status: 'your_turn',
      reservedCopyId: 'copy1',
      confirmDeadline: DEADLINE,
    })

    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'qe1', { position: 3, confirmed: false }),
      ),
    ).toMatchObject({ status: 409, code: 'turn_in_progress' })
    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'qe4', {
          position: 1,
          reason: 'x',
          confirmed: true,
        }),
      ),
    ).toMatchObject({ status: 409, code: 'invalid_position' })
  })

  it('lugar que não existe devolve 404 e lugar que já saiu da fila, 409', async () => {
    putEntry(h.db, 'qe9', { studentUid: 'x', status: 'left' })

    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'nao-existe', {
          position: 1,
          confirmed: false,
        }),
      ),
    ).toMatchObject({ status: 404, code: 'queue_entry_not_found' })
    expect(
      await catchError(
        moveQueueEntry(LIBRARIAN_UID, 'qe9', { position: 1, confirmed: false }),
      ),
    ).toMatchObject({ status: 409, code: 'queue_entry_not_active' })
  })
})

describe('remover da fila com motivo (removeFromQueue, RF-BAL-06)', () => {
  it('o lugar vira removed, com o motivo e quem tirou', async () => {
    const queue = await removeFromQueue(LIBRARIAN_UID, 'qe2', {
      reason: 'Aluno trancou o curso',
    })

    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'removed',
      endReason: 'Aluno trancou o curso',
      endedBy: LIBRARIAN_UID,
      endedAt: NOW,
    })
    expect(queue.items.map((item) => item.matricula)).toEqual([
      '2311001',
      '2210001',
      '2513320',
    ])
  })

  it('libera a vaga do aluno e encurta a fila do livro', async () => {
    await removeFromQueue(LIBRARIAN_UID, 'qe2', { reason: 'Trancou' })

    expect(h.db.read('books', 'book1')).toMatchObject({ queueLength: 3 })
    expect(h.db.read('users', 'uid_lucas')).toMatchObject({
      activeQueueCount: 0,
    })
  })

  it('avisa o aluno com o motivo e grava o auditLog queue_remove', async () => {
    await removeFromQueue(LIBRARIAN_UID, 'qe2', {
      reason: 'Aluno trancou o curso',
    })

    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'queue_removed_by_librarian',
      body: 'O balcão da biblioteca tirou você da fila. Motivo: Aluno trancou o curso',
    })
    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN_UID,
        action: 'queue_remove',
        targetUid: 'uid_lucas',
        entityId: 'qe2',
        reason: 'Aluno trancou o curso',
      }),
    ])
  })

  it('removendo quem estava na vez, o exemplar guardado passa ao próximo', async () => {
    putCopy(h.db, 'copy1', {
      status: 'reserved',
      reservedForQueueEntryId: 'qe1',
    })
    putEntry(h.db, 'qe1', {
      bookTitle: 'Arquitetura Limpa',
      studentUid: 'uid_ana_beatriz',
      studentName: 'Ana Beatriz Lima',
      matricula: '2311001',
      order: 1000,
      status: 'your_turn',
      reservedCopyId: 'copy1',
      confirmDeadline: DEADLINE,
    })

    await removeFromQueue(LIBRARIAN_UID, 'qe1', { reason: 'Pediu para sair' })

    expect(h.db.read('copies', 'copy1')).toMatchObject({
      status: 'reserved',
      reservedForQueueEntryId: 'qe2',
    })
    expect(h.db.read('queueEntries', 'qe2')).toMatchObject({
      status: 'your_turn',
    })
  })

  it('lugar que não existe devolve 404 e lugar que já saiu, 409', async () => {
    await removeFromQueue(LIBRARIAN_UID, 'qe2', { reason: 'Trancou' })

    expect(
      await catchError(
        removeFromQueue(LIBRARIAN_UID, 'nao-existe', { reason: 'x' }),
      ),
    ).toMatchObject({ status: 404 })
    expect(
      await catchError(removeFromQueue(LIBRARIAN_UID, 'qe2', { reason: 'x' })),
    ).toMatchObject({ status: 409, code: 'queue_entry_not_active' })
  })
})

describe('reenviar o aviso da vez (resendTurnNotice, RF-BAL-06)', () => {
  beforeEach(() => {
    putCopy(h.db, 'copy1', {
      status: 'reserved',
      reservedForQueueEntryId: 'qe1',
    })
    putEntry(h.db, 'qe1', {
      bookTitle: 'Arquitetura Limpa',
      studentUid: 'uid_ana_beatriz',
      studentName: 'Ana Beatriz Lima',
      matricula: '2311001',
      order: 1000,
      status: 'your_turn',
      reservedCopyId: 'copy1',
      turnStartedAt: atLocalTime('2026-10-15', '09:12'),
      confirmDeadline: DEADLINE,
      lastNotifiedAt: atLocalTime('2026-10-15', '09:12'),
      notifyCount: 1,
    })
  })

  it('manda o aviso de novo, sem mudar o prazo, e conta o envio', async () => {
    const queue = await resendTurnNotice(LIBRARIAN_UID, 'qe1')

    expect(h.db.read('queueEntries', 'qe1')).toMatchObject({
      lastNotifiedAt: NOW,
      notifyCount: 2,
      confirmDeadline: DEADLINE,
      status: 'your_turn',
    })
    expect(h.db.all('users/uid_ana_beatriz/notifications')[0]).toMatchObject({
      type: 'queue_turn',
      body: 'Confirme até 17/10 às 09:12 que vai retirar.',
    })
    expect(queue.items[0]).toMatchObject({ notifyCount: 2 })
  })

  it('grava o auditLog queue_resend_notice', async () => {
    await resendTurnNotice(LIBRARIAN_UID, 'qe1')

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: LIBRARIAN_UID,
        action: 'queue_resend_notice',
        targetUid: 'uid_ana_beatriz',
        entityId: 'qe1',
        details: { notifyCount: 2 },
      }),
    ])
  })

  it('quem ainda espera devolve 409 not_your_turn e nada é gravado', async () => {
    expect(
      await catchError(resendTurnNotice(LIBRARIAN_UID, 'qe2')),
    ).toMatchObject({ status: 409, code: 'not_your_turn' })
    expect(h.db.all('auditLog')).toHaveLength(0)
  })

  it('lugar que não existe devolve 404 e lugar que já saiu, 409', async () => {
    putEntry(h.db, 'qe9', { studentUid: 'x', status: 'missed' })

    expect(
      await catchError(resendTurnNotice(LIBRARIAN_UID, 'nao-existe')),
    ).toMatchObject({ status: 404 })
    expect(
      await catchError(resendTurnNotice(LIBRARIAN_UID, 'qe9')),
    ).toMatchObject({ status: 409, code: 'queue_entry_not_active' })
  })
})
