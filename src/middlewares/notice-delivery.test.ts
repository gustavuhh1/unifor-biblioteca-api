import express from 'express'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  deliverNotices: vi.fn(),
}))

vi.mock('../modules/notifications/services/notice-delivery.service.js', () => ({
  deliverNotices: h.deliverNotices,
}))

const { deliverNoticesBeforeResponse } = await import('./notice-delivery.js')
const { enqueueDelivery } =
  await import('../modules/notifications/delivery-batch.js')

const app = express()
app.use(deliverNoticesBeforeResponse)
app.post('/com-aviso', async (_req, res) => {
  await Promise.resolve()
  enqueueDelivery({ uid: 'u1', id: 'n1' })
  res.json({ ok: true })
})
app.get('/sem-aviso', (_req, res) => {
  res.json({ ok: true })
})
app.post('/com-erro', (_req, res) => {
  enqueueDelivery({ uid: 'u1', id: 'n2' })
  res.status(409).json({ code: 'conflito' })
})

const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
  const listening = app.listen(0, () => resolve(listening))
})
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

afterAll(() => {
  server.close()
})

beforeEach(() => {
  h.deliverNotices.mockReset().mockResolvedValue(undefined)
})

describe('entrega dos avisos antes de responder (deliverNoticesBeforeResponse)', () => {
  it('entrega os avisos gravados pela requisição antes de a resposta sair', async () => {
    let delivered = false
    h.deliverNotices.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      delivered = true
    })

    const response = await fetch(`${base}/com-aviso`, { method: 'POST' })

    expect(delivered).toBe(true)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(h.deliverNotices).toHaveBeenCalledWith([{ uid: 'u1', id: 'n1' }])
  })

  it('requisição sem aviso responde na hora, sem chamar a entrega', async () => {
    const response = await fetch(`${base}/sem-aviso`)

    expect(response.status).toBe(200)
    expect(h.deliverNotices).not.toHaveBeenCalled()
  })

  it('a resposta sai mesmo se a requisição falhou depois de anotar o aviso', async () => {
    const response = await fetch(`${base}/com-erro`, { method: 'POST' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: 'conflito' })
  })
})
