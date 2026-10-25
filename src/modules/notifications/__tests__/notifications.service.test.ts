import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { listMyNotifications, markAllRead } =
  await import('../services/notifications.service.js')
const { AT, STUDENT, noticePath, putNotice } =
  await import('./notifications.fixtures.js')

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T09:00:00Z'))
})

describe('listMyNotifications: Notificações (RF-AVI-01)', () => {
  it('lista do aviso mais novo para o mais antigo e conta os não lidos', async () => {
    putNotice(h.db, {
      id: 'velho',
      createdAt: new Date('2026-10-20T10:00:00Z'),
    })
    putNotice(h.db, {
      id: 'novo',
      createdAt: new Date('2026-10-22T10:00:00Z'),
      readAt: AT,
    })
    putNotice(h.db, { id: 'meio', createdAt: new Date('2026-10-21T10:00:00Z') })

    const response = await listMyNotifications(STUDENT)

    expect(response.items.map((item) => item.id)).toEqual([
      'novo',
      'meio',
      'velho',
    ])
    expect(response.unreadCount).toBe(2)
  })

  it('não mostra os avisos de outro aluno', async () => {
    h.db.put('users/uid_marina/notifications', 'm1', {
      type: 'overdue',
      title: 'Atrasado',
      body: 'Devolva.',
      action: 'none',
      delivery: { push: 'sent', email: 'sent' },
      createdAt: AT,
      updatedAt: AT,
    })

    expect((await listMyNotifications(STUDENT)).items).toEqual([])
  })
})

describe('markAllRead: marcar todas como lidas (RF-AVI-01)', () => {
  it('preenche readAt nos não lidos e não mexe nos que já estavam lidos', async () => {
    putNotice(h.db, { id: 'a' })
    putNotice(h.db, { id: 'b' })
    putNotice(h.db, { id: 'c', readAt: AT })

    await markAllRead(STUDENT)

    const read = (id: string) =>
      (h.db.read(noticePath, id) as { readAt: Date }).readAt
    expect(read('a')).toEqual(new Date('2026-10-23T09:00:00Z'))
    expect(read('b')).toEqual(new Date('2026-10-23T09:00:00Z'))
    expect(read('c')).toEqual(AT)
    expect((await listMyNotifications(STUDENT)).unreadCount).toBe(0)
  })

  it('sem avisos, não dá erro', async () => {
    await expect(markAllRead(STUDENT)).resolves.toBeUndefined()
  })
})
