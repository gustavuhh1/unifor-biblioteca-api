import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendPush, type PushMessage } from '../push/expo-push.client.js'

const message = (to: string): PushMessage => ({
  to,
  title: 'É a sua vez',
  body: 'Confirme até amanhã.',
  data: { notificationId: 'n1' },
})

function mockFetch(response: Partial<Response> & { json?: () => unknown }) {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('push pelo Expo (sendPush, RF-AVI-02)', () => {
  it('manda as mensagens numa chamada só e devolve o resultado de cada uma', async () => {
    const fetchMock = mockFetch({
      ok: true,
      json: async () => ({
        data: [
          { status: 'ok', id: 'tk1' },
          {
            status: 'error',
            message: 'não registrado',
            details: { error: 'DeviceNotRegistered' },
          },
          {
            status: 'error',
            message: 'outro',
            details: { error: 'MessageRateExceeded' },
          },
        ],
      }),
    })

    const result = await sendPush([message('a'), message('b'), message('c')])

    expect(result).toEqual(['ok', 'invalid_token', 'failed'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    const sent = JSON.parse(init.body as string) as Record<string, unknown>[]
    expect(sent).toHaveLength(3)
    expect(sent[0]).toMatchObject({
      to: 'a',
      sound: 'default',
      data: { notificationId: 'n1' },
    })
  })

  it('resposta de erro do Expo: todas as mensagens ficam failed', async () => {
    mockFetch({ ok: false })

    expect(await sendPush([message('a'), message('b')])).toEqual([
      'failed',
      'failed',
    ])
  })

  it('o Expo não responde (rede ou tempo esgotado): failed, sem lançar erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('rede')))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(await sendPush([message('a')])).toEqual(['failed'])
  })

  it('resposta fora do formato: failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch({ ok: true, json: async () => ({ erro: true }) })

    expect(await sendPush([message('a')])).toEqual(['failed'])
  })

  it('ticket que falta na resposta conta como failed', async () => {
    mockFetch({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) })

    expect(await sendPush([message('a'), message('b')])).toEqual([
      'ok',
      'failed',
    ])
  })

  it('divide em levas de 100 mensagens', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url, init: RequestInit) => {
        const sent = JSON.parse(init.body as string) as unknown[]
        return {
          ok: true,
          json: async () => ({ data: sent.map(() => ({ status: 'ok' })) }),
        }
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendPush(
      Array.from({ length: 250 }, (_, i) => message(`t${i}`)),
    )

    expect(result).toHaveLength(250)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('sem mensagens, não chama o Expo', async () => {
    const fetchMock = mockFetch({ ok: true })

    expect(await sendPush([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
