import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFICATION_PREFS } from '../../../shared/domain/user.js'
import {
  NOTIFICATION_TYPES,
  type NotificationPrefs,
} from '../../../shared/types/index.js'
import {
  hasPush,
  isTypeEnabled,
  pushDeliveryOf,
  pushPlan,
  shouldEmail,
} from '../rules/delivery.rules.js'
import { makeDevice } from './notifications.fixtures.js'

const prefs = (changes: Partial<NotificationPrefs> = {}) => ({
  ...DEFAULT_NOTIFICATION_PREFS,
  ...changes,
})

describe('tipo de aviso ligado (isTypeEnabled, RF-AVI-03)', () => {
  it('todo tipo de aviso tem uma preferência que manda nele', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(() => isTypeEnabled(type, prefs())).not.toThrow()
      expect(isTypeEnabled(type, prefs())).toBe(true)
    }
  })

  it('"Sua vez" e "Atraso e multa" valem mesmo se a preferência vier desligada', () => {
    const off = prefs({ queueTurn: false, overdueAndFines: false })

    expect(isTypeEnabled('queue_turn', off)).toBe(true)
    expect(isTypeEnabled('queue_turn_missed', off)).toBe(true)
    expect(isTypeEnabled('overdue', off)).toBe(true)
    expect(isTypeEnabled('fine_open', off)).toBe(true)
  })

  it('cada preferência desliga os seus tipos', () => {
    expect(isTypeEnabled('due_reminder', prefs({ dueReminders: false }))).toBe(
      false,
    )
    for (const type of ['pickup_ready', 'pickup_expiring', 'pickup_expired']) {
      expect(isTypeEnabled(type as never, prefs({ pickupReady: false }))).toBe(
        false,
      )
    }
    expect(
      isTypeEnabled('queue_moved_up', prefs({ queueUpdates: false })),
    ).toBe(false)
    for (const type of [
      'return_confirmed',
      'fine_paid',
      'renewal_done',
      'loan_picked_up',
    ]) {
      expect(
        isTypeEnabled(type as never, prefs({ returnConfirmed: false })),
      ).toBe(false)
    }
  })
})

describe('aparelho com push (hasPush)', () => {
  it('só o Android com token que o Expo não recusou', () => {
    expect(hasPush(makeDevice())).toBe(true)
    expect(hasPush(makeDevice({ platform: 'ios' }))).toBe(false)
    expect(hasPush(makeDevice({ expoPushToken: undefined }))).toBe(false)
    expect(hasPush(makeDevice({ pushDisabledAt: new Date() }))).toBe(false)
  })
})

describe('plano do push (pushPlan, RF-AVI-02)', () => {
  it('manda aos aparelhos Android com token', () => {
    const android = makeDevice({ id: 'a' })
    const iphone = makeDevice({ id: 'i', platform: 'ios' })

    expect(pushPlan('queue_turn', prefs(), [android, iphone])).toEqual({
      devices: [android],
    })
  })

  it('canal desligado ou tipo desligado: disabled', () => {
    const devices = [makeDevice()]

    expect(
      pushPlan('queue_turn', prefs({ channelPush: false }), devices),
    ).toEqual({ status: 'disabled' })
    expect(
      pushPlan('due_reminder', prefs({ dueReminders: false }), devices),
    ).toEqual({ status: 'disabled' })
  })

  it('sem aparelho Android com push: unsupported', () => {
    expect(pushPlan('queue_turn', prefs(), [])).toEqual({
      status: 'unsupported',
    })
    expect(
      pushPlan('queue_turn', prefs(), [makeDevice({ platform: 'ios' })]),
    ).toEqual({ status: 'unsupported' })
  })
})

describe('plano do e-mail (shouldEmail, RF-AVI-02)', () => {
  it('envia quando o canal e o tipo estão ligados', () => {
    expect(shouldEmail('return_confirmed', prefs())).toBe(true)
  })

  it('não envia com o canal ou o tipo desligado', () => {
    expect(
      shouldEmail('return_confirmed', prefs({ channelEmail: false })),
    ).toBe(false)
    expect(
      shouldEmail('return_confirmed', prefs({ returnConfirmed: false })),
    ).toBe(false)
  })

  it('"Sua vez" sai por e-mail mesmo com os outros tipos desligados', () => {
    const quiet = prefs({
      dueReminders: false,
      pickupReady: false,
      queueUpdates: false,
      returnConfirmed: false,
    })

    expect(shouldEmail('queue_turn', quiet)).toBe(true)
  })
})

describe('resultado do push no aviso (pushDeliveryOf, RF-AVI-04)', () => {
  it('sent se pelo menos um aparelho recebeu', () => {
    expect(pushDeliveryOf(['failed', 'ok'])).toBe('sent')
  })

  it('failed se nenhum recebeu', () => {
    expect(pushDeliveryOf(['failed', 'invalid_token'])).toBe('failed')
  })
})
