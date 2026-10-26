import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))
vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { atLocalTime } = await import('../../../shared/calendar/dates.js')
const { makeActiveLoan, makeStudent } =
  await import('../../loans/__tests__/loan.fixtures.js')
const { sendDueReminders } =
  await import('../services/due-reminders.service.js')

const NOW = atLocalTime('2026-10-15', '12:00')

beforeEach(() => {
  h.db = new Fake()
  h.db.put('users', 'uid_lucas', {
    ...makeStudent(),
    notificationPrefs: { dueReminders: true },
  })
})

describe('lembretes de vencimento', () => {
  it('avisa dois dias antes e não repete numa segunda execução', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-17', '14:10') }),
    )

    expect(await sendDueReminders(NOW)).toMatchObject({ processed: 1 })
    expect(await sendDueReminders(NOW)).toMatchObject({ processed: 0 })
    expect(h.db.all('users/uid_lucas/notifications')).toHaveLength(1)
    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'due_reminder',
    })
  })

  it('envia o aviso de atraso uma única vez', async () => {
    h.db.put(
      'loans',
      'loan1',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-14', '21:55') }),
    )

    await sendDueReminders(NOW)
    await sendDueReminders(NOW)

    expect(h.db.all('users/uid_lucas/notifications')).toHaveLength(1)
    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'overdue',
    })
  })

  it('respeita a preferência de lembrete, mas atraso continua obrigatório', async () => {
    h.db.put('users', 'uid_lucas', {
      ...makeStudent(),
      notificationPrefs: { dueReminders: false },
    })
    h.db.put(
      'loans',
      'soon',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-17', '14:10') }),
    )
    h.db.put(
      'loans',
      'late',
      makeActiveLoan({ dueAt: atLocalTime('2026-10-14', '21:55') }),
    )

    expect(await sendDueReminders(NOW)).toMatchObject({ processed: 1 })
    expect(h.db.all('users/uid_lucas/notifications')[0]).toMatchObject({
      type: 'overdue',
    })
  })
})
