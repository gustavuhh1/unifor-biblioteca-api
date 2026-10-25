import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { enqueueDelivery, runWithDeliveryBatch } =
  await import('../delivery-batch.js')
const notificationsRepository =
  await import('../repositories/notifications.repository.js')
const { makeNotice, STUDENT, noticePath } =
  await import('./notifications.fixtures.js')

const NOTICE = makeNotice()

beforeEach(() => {
  h.db = new Fake()
})

describe('avisos pendentes de entrega da requisição (delivery-batch)', () => {
  it('anota na lista da requisição em andamento', () => {
    const batch: { uid: string; id: string }[] = []

    runWithDeliveryBatch(batch, () => enqueueDelivery({ uid: 'u1', id: 'n1' }))

    expect(batch).toEqual([{ uid: 'u1', id: 'n1' }])
  })

  it('cada requisição tem a sua lista, mesmo rodando ao mesmo tempo', async () => {
    const first: { uid: string; id: string }[] = []
    const second: { uid: string; id: string }[] = []

    await Promise.all([
      runWithDeliveryBatch(first, async () => {
        await Promise.resolve()
        enqueueDelivery({ uid: 'u1', id: 'a' })
      }),
      runWithDeliveryBatch(second, async () => {
        enqueueDelivery({ uid: 'u2', id: 'b' })
      }),
    ])

    expect(first).toEqual([{ uid: 'u1', id: 'a' }])
    expect(second).toEqual([{ uid: 'u2', id: 'b' }])
  })

  it('fora de uma requisição não faz nada nem dá erro', () => {
    expect(() => enqueueDelivery({ uid: 'u1', id: 'n1' })).not.toThrow()
  })
})

describe('gravar um aviso (notificationsRepository.create)', () => {
  it('grava o aviso, devolve o id e o anota para a entrega', async () => {
    const batch: { uid: string; id: string }[] = []

    const id = await runWithDeliveryBatch(batch, () =>
      h.db.runTransaction(async (tx) =>
        notificationsRepository.create(tx as never, STUDENT, NOTICE),
      ),
    )

    expect(batch).toEqual([{ uid: STUDENT, id }])
    expect(h.db.read(noticePath, id)).toMatchObject({
      title: 'É a sua vez: Código Limpo',
      delivery: { push: 'skipped', email: 'skipped' },
    })
  })
})
