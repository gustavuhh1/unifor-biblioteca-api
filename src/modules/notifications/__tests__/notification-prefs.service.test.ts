import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { updateNotificationPrefs } =
  await import('../services/notification-prefs.service.js')
const { notificationPrefsBodySchema } =
  await import('../schemas/request.schemas.js')
const { STUDENT, putStudent } = await import('./notifications.fixtures.js')

const storedPrefs = () =>
  (
    h.db.read('users', STUDENT) as {
      notificationPrefs: Record<string, boolean>
    }
  ).notificationPrefs

beforeEach(() => {
  h.db = new Fake()
  putStudent(h.db)
})

describe('updateNotificationPrefs: Avisos e lembretes (RF-AVI-03)', () => {
  it('muda só as chaves enviadas e mantém as outras', async () => {
    const prefs = await updateNotificationPrefs(STUDENT, {
      dueReminders: false,
      channelEmail: false,
    })

    expect(prefs.dueReminders).toBe(false)
    expect(prefs.channelEmail).toBe(false)
    expect(prefs.pickupReady).toBe(true)
    expect(storedPrefs()).toEqual(prefs)
  })

  it('religa o que estava desligado', async () => {
    putStudent(h.db, { queueUpdates: false })

    const prefs = await updateNotificationPrefs(STUDENT, { queueUpdates: true })

    expect(prefs.queueUpdates).toBe(true)
  })

  it('ignora chaves sem valor', async () => {
    const prefs = await updateNotificationPrefs(STUDENT, {
      pickupReady: undefined,
      returnConfirmed: false,
    })

    expect(prefs.pickupReady).toBe(true)
    expect(prefs.returnConfirmed).toBe(false)
  })
})

describe('corpo de PATCH /me/notification-prefs (notificationPrefsBodySchema)', () => {
  it('recusa desligar "Sua vez na fila" e "Atraso e multa", com mensagem em português', () => {
    const turn = notificationPrefsBodySchema.safeParse({ queueTurn: false })
    const fines = notificationPrefsBodySchema.safeParse({
      overdueAndFines: false,
    })

    expect(turn.error?.issues[0]?.message).toBe(
      '"Sua vez na fila" fica sempre ligado.',
    )
    expect(fines.error?.issues[0]?.message).toBe(
      '"Atraso e multa" fica sempre ligado.',
    )
  })

  it('aceita ligar os dois e desligar os demais', () => {
    expect(
      notificationPrefsBodySchema.safeParse({
        queueTurn: true,
        overdueAndFines: true,
        channelPush: false,
      }).success,
    ).toBe(true)
  })

  it('recusa corpo vazio e valor que não é booleano', () => {
    expect(
      notificationPrefsBodySchema.safeParse({}).error?.issues[0]?.message,
    ).toBe('Informe ao menos um aviso para mudar.')
    expect(
      notificationPrefsBodySchema.safeParse({ dueReminders: 'nao' }).success,
    ).toBe(false)
  })
})
