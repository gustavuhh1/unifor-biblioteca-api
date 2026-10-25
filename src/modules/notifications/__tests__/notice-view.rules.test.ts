import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS } from '../../../shared/domain/user.js'
import {
  toDeviceResponse,
  toNotificationResponse,
  toNotificationsResponse,
  toPrefsResponse,
} from '../rules/notice-view.rules.js'
import { AT, makeDevice, makeNotice } from './notifications.fixtures.js'

describe('aviso na resposta (toNotificationResponse, RF-AVI-01)', () => {
  it('mostra o aviso sem o resultado da entrega e com null no que falta', () => {
    const response = toNotificationResponse(makeNotice())

    expect(response).toEqual({
      id: 'n1',
      type: 'queue_turn',
      title: 'É a sua vez: Código Limpo',
      body: 'Confirme até amanhã, 09:12, que vai retirar.',
      action: 'confirm_turn',
      bookId: 'book1',
      loanId: null,
      queueEntryId: 'qe1',
      fineId: null,
      readAt: null,
      createdAt: '2026-10-22T12:00:00.000Z',
    })
  })
})

describe('lista de avisos (toNotificationsResponse)', () => {
  it('conta só os não lidos', () => {
    const response = toNotificationsResponse([
      makeNotice({ id: 'a' }),
      makeNotice({ id: 'b', readAt: AT }),
      makeNotice({ id: 'c' }),
    ])

    expect(response.items).toHaveLength(3)
    expect(response.unreadCount).toBe(2)
  })

  it('lista vazia: zero não lidos', () => {
    expect(toNotificationsResponse([])).toEqual({ items: [], unreadCount: 0 })
  })
})

describe('preferências na resposta (toPrefsResponse, RF-AVI-03)', () => {
  it('mantém "Sua vez" e "Atraso e multa" sempre ligados', () => {
    const prefs = toPrefsResponse({
      ...DEFAULT_NOTIFICATION_PREFS,
      queueTurn: false,
      overdueAndFines: false,
      dueReminders: false,
    })

    expect(prefs.queueTurn).toBe(true)
    expect(prefs.overdueAndFines).toBe(true)
    expect(prefs.dueReminders).toBe(false)
  })
})

describe('aparelho na resposta (toDeviceResponse)', () => {
  it('não mostra o token e diz se o push está ligado', () => {
    const response = toDeviceResponse(makeDevice({ deviceName: 'Pixel 6a' }))

    expect(response).toEqual({
      id: 'device1',
      platform: 'android',
      deviceName: 'Pixel 6a',
      appVersion: null,
      pushEnabled: true,
      lastSeenAt: '2026-10-22T12:00:00.000Z',
    })
    expect(JSON.stringify(response)).not.toContain('ExponentPushToken')
  })

  it('iPhone e token recusado ficam sem push', () => {
    expect(toDeviceResponse(makeDevice({ platform: 'ios' })).pushEnabled).toBe(
      false,
    )
    expect(
      toDeviceResponse(makeDevice({ pushDisabledAt: AT })).pushEnabled,
    ).toBe(false)
  })
})
