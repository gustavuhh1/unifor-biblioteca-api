import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { registerDevice, removeDevice } =
  await import('../services/devices.service.js')
const { deviceBodySchema } = await import('../schemas/request.schemas.js')
const { AT, STUDENT, TOKEN, devicePath, putDevice } =
  await import('./notifications.fixtures.js')

const NOW = new Date('2026-10-23T09:00:00Z')
const stored = (id = 'device1') =>
  h.db.read(devicePath, id) as Record<string, unknown> | undefined

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('registerDevice (RF-AVI-02)', () => {
  it('registra o aparelho Android com o token e liga o push', async () => {
    const device = await registerDevice(STUDENT, 'device1', {
      platform: 'android',
      expoPushToken: TOKEN,
      deviceName: 'Pixel 6a',
      appVersion: '1.0.0',
    })

    expect(device).toMatchObject({
      id: 'device1',
      platform: 'android',
      pushEnabled: true,
      lastSeenAt: NOW.toISOString(),
    })
    expect(stored()).toMatchObject({
      expoPushToken: TOKEN,
      deviceName: 'Pixel 6a',
      createdAt: NOW,
    })
  })

  it('no iPhone ignora o token: o aparelho fica sem push', async () => {
    const device = await registerDevice(STUDENT, 'device1', {
      platform: 'ios',
      expoPushToken: TOKEN,
    })

    expect(device.pushEnabled).toBe(false)
    expect(stored()).not.toHaveProperty('expoPushToken')
  })

  it('chamar de novo atualiza lastSeenAt e mantém a data de criação', async () => {
    putDevice(h.db)

    await registerDevice(STUDENT, 'device1', {
      platform: 'android',
      expoPushToken: TOKEN,
    })

    expect(stored()).toMatchObject({ lastSeenAt: NOW, createdAt: AT })
  })

  it('o mesmo token que o Expo recusou continua sem push', async () => {
    putDevice(h.db, { pushDisabledAt: AT })

    const device = await registerDevice(STUDENT, 'device1', {
      platform: 'android',
      expoPushToken: TOKEN,
    })

    expect(device.pushEnabled).toBe(false)
  })

  it('um token novo volta a ligar o push do aparelho', async () => {
    putDevice(h.db, { pushDisabledAt: AT })

    const device = await registerDevice(STUDENT, 'device1', {
      platform: 'android',
      expoPushToken: 'ExponentPushToken[novo]',
    })

    expect(device.pushEnabled).toBe(true)
    expect(stored()).not.toHaveProperty('pushDisabledAt')
  })
})

describe('removeDevice (RF-AVI-02)', () => {
  it('apaga o aparelho', async () => {
    putDevice(h.db)

    await removeDevice(STUDENT, 'device1')

    expect(stored()).toBeUndefined()
  })

  it('aparelho que não estava registrado: nada muda e não dá erro', async () => {
    await expect(removeDevice(STUDENT, 'x')).resolves.toBeUndefined()
  })
})

describe('corpo de PUT /me/devices/:deviceId (deviceBodySchema)', () => {
  it('aceita a plataforma com o token do Expo', () => {
    expect(
      deviceBodySchema.safeParse({ platform: 'android', expoPushToken: TOKEN })
        .success,
    ).toBe(true)
    expect(
      deviceBodySchema.safeParse({
        platform: 'android',
        expoPushToken: 'ExpoPushToken[abc]',
      }).success,
    ).toBe(true)
  })

  it('recusa plataforma desconhecida e token em outro formato, em português', () => {
    expect(
      deviceBodySchema.safeParse({ platform: 'windows' }).error?.issues[0]
        ?.message,
    ).toBe('Plataforma inválida: use android ou ios.')
    expect(
      deviceBodySchema.safeParse({ platform: 'android', expoPushToken: 'abc' })
        .error?.issues[0]?.message,
    ).toBe('Token de push inválido.')
  })
})
