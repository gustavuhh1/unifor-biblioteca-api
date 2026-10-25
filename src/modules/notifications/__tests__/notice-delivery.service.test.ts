import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  sendPush: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../push/expo-push.client.js', () => ({ sendPush: h.sendPush }))
vi.mock('../../../shared/mail/email.js', () => ({ sendEmail: h.sendEmail }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { deliverNotices } =
  await import('../services/notice-delivery.service.js')
const {
  EMAIL,
  STUDENT,
  TOKEN,
  devicePath,
  noticePath,
  putDevice,
  putNotice,
  putStudent,
} = await import('./notifications.fixtures.js')

const delivery = (id = 'n1') =>
  (h.db.read(noticePath, id) as { delivery: Record<string, string> }).delivery

const batch = (...ids: string[]) => ids.map((id) => ({ uid: STUDENT, id }))

beforeEach(() => {
  h.db = new Fake()
  h.sendPush.mockReset().mockResolvedValue(['ok'])
  h.sendEmail.mockReset().mockResolvedValue('sent')
  putStudent(h.db)
  putDevice(h.db)
  putNotice(h.db)
})

describe('entrega do aviso por push e e-mail (deliverNotices, RF-AVI-02)', () => {
  it('manda o push ao aparelho Android e o e-mail ao endereço cadastrado', async () => {
    await deliverNotices(batch('n1'))

    expect(delivery()).toEqual({ push: 'sent', email: 'sent' })
    expect(h.sendPush).toHaveBeenCalledWith([
      expect.objectContaining({
        to: TOKEN,
        title: 'É a sua vez: Código Limpo',
        data: expect.objectContaining({ notificationId: 'n1' }),
      }),
    ])
    expect(h.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: EMAIL,
        subject: 'É a sua vez: Código Limpo',
      }),
    )
  })

  it('canais desligados: disabled nos dois e nada é enviado', async () => {
    putStudent(h.db, { channelPush: false, channelEmail: false })

    await deliverNotices(batch('n1'))

    expect(delivery()).toEqual({ push: 'disabled', email: 'disabled' })
    expect(h.sendPush).not.toHaveBeenCalled()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('tipo desligado pelo aluno: sem push nem e-mail (RF-AVI-03)', async () => {
    putStudent(h.db, { dueReminders: false })
    putNotice(h.db, { id: 'n2', type: 'due_reminder' })

    await deliverNotices(batch('n2'))

    expect(delivery('n2')).toEqual({ push: 'disabled', email: 'disabled' })
  })

  it('só iPhone ou nenhum aparelho: push unsupported, e-mail sai (RF-AVI-02)', async () => {
    h.db = new Fake()
    putStudent(h.db)
    putNotice(h.db)
    putDevice(h.db, { platform: 'ios', expoPushToken: undefined })

    await deliverNotices(batch('n1'))

    expect(delivery()).toEqual({ push: 'unsupported', email: 'sent' })
    expect(h.sendPush).not.toHaveBeenCalled()
  })

  it('push que falha: failed no push e o e-mail segue (RF-AVI-04)', async () => {
    h.sendPush.mockResolvedValue(['failed'])

    await deliverNotices(batch('n1'))

    expect(delivery()).toEqual({ push: 'failed', email: 'sent' })
  })

  it('e-mail que falha ou não está configurado: failed, e o push segue', async () => {
    h.sendEmail.mockResolvedValue('unavailable')

    await deliverNotices(batch('n1'))

    expect(delivery()).toEqual({ push: 'sent', email: 'failed' })
  })

  it('no emulador sem chave o e-mail fica skipped e só o assunto vai ao console', async () => {
    h.sendEmail.mockResolvedValue('console')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await deliverNotices(batch('n1'))

    expect(delivery().email).toBe('skipped')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('É a sua vez'))
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining(EMAIL))
  })

  it('token que o Expo recusou desliga o push do aparelho', async () => {
    h.sendPush.mockResolvedValue(['invalid_token'])

    await deliverNotices(batch('n1'))

    expect(delivery().push).toBe('failed')
    expect(
      (h.db.read(devicePath, 'device1') as { pushDisabledAt?: Date })
        .pushDisabledAt,
    ).toBeInstanceOf(Date)
  })

  it('o aluno com dois aparelhos recebe nos dois', async () => {
    putDevice(h.db, {
      id: 'device2',
      expoPushToken: 'ExponentPushToken[outro]',
    })
    h.sendPush.mockResolvedValue(['ok', 'ok'])

    await deliverNotices(batch('n1'))

    const messages = h.sendPush.mock.calls[0]?.[0] as { to: string }[]
    expect(messages.map((message) => message.to).sort()).toEqual(
      [TOKEN, 'ExponentPushToken[outro]'].sort(),
    )
  })

  it('descarta aviso que não existe (transação desfeita)', async () => {
    await deliverNotices(batch('nao-existe'))

    expect(h.sendPush).not.toHaveBeenCalled()
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('não entrega duas vezes o mesmo aviso', async () => {
    await deliverNotices(batch('n1'))
    await deliverNotices(batch('n1'))

    expect(h.sendPush).toHaveBeenCalledTimes(1)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('entrega vários avisos do mesmo aluno', async () => {
    putNotice(h.db, { id: 'n2', title: 'Pedido pronto', type: 'pickup_ready' })

    await deliverNotices(batch('n1', 'n2'))

    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(delivery('n2').email).toBe('sent')
  })

  it('erro inesperado na entrega de um aluno não derruba a dos outros nem lança', async () => {
    const { DEFAULT_NOTIFICATION_PREFS } =
      await import('../../../shared/domain/user.js')
    const { makeNotice, AT } = await import('./notifications.fixtures.js')
    h.db.put('users', 'uid_marina', {
      role: 'student',
      email: 'marina.castro@edu.unifor.br',
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      createdAt: AT,
      updatedAt: AT,
    })
    const marinaNotice: Record<string, unknown> = {
      ...makeNotice({ id: 'm1' }),
    }
    delete marinaNotice.id
    h.db.put('users/uid_marina/notifications', 'm1', marinaNotice)
    h.sendEmail.mockImplementation(async (message: { to: string }) => {
      if (message.to.startsWith('marina')) throw new Error('quebrou')
      return 'sent'
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      deliverNotices([
        { uid: 'uid_marina', id: 'm1' },
        { uid: STUDENT, id: 'n1' },
      ]),
    ).resolves.toBeUndefined()

    expect(delivery()).toEqual({ push: 'sent', email: 'sent' })
  })
})
