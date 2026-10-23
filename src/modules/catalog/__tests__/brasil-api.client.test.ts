import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lookupBrasilApi } from '../book-metadata/brasil-api.client.js'
import {
  BOOK_METADATA_USER_AGENT,
  LOOKUP_STATUS,
} from '../catalog.constants.js'
import {
  BRASIL_API_1984,
  BRASIL_API_BAD_REQUEST,
  jsonResponse,
} from './book-metadata.fixtures.js'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const options = (fetchImpl: typeof fetch) => ({ fetchImpl, timeoutMs: 50 })

describe('consulta do ISBN na BrasilAPI (lookupBrasilApi)', () => {
  it('faz uma chamada a isbn/v1 e devolve os dados mapeados, com a sinopse', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(BRASIL_API_1984))

    const result = await lookupBrasilApi('9788535914849', options(fetchImpl))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://brasilapi.com.br/api/isbn/v1/9788535914849',
    )
    expect(result).toEqual({
      status: LOOKUP_STATUS.found,
      data: expect.objectContaining({
        title: '1984',
        publisher: 'Companhia das Letras',
        year: 2009,
        synopsis: expect.stringContaining('distopia futurista'),
      }),
    })
    // A BrasilAPI não tem chave de livro.
    expect(result).not.toHaveProperty('openLibraryKey')
  })

  it('identifica o app com o User-Agent e põe um tempo máximo na chamada', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(BRASIL_API_1984))

    await lookupBrasilApi('9788535914849', options(fetchImpl))

    const init = fetchImpl.mock.calls[0]![1]
    expect(init?.headers).toMatchObject({
      'user-agent': BOOK_METADATA_USER_AGENT,
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('404 é "não encontrado"', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: 'ISBN não encontrado' }, 404))

    expect(await lookupBrasilApi('9788535914849', options(fetchImpl))).toEqual({
      status: LOOKUP_STATUS.notFound,
    })
  })

  it('400 (ISBN de fora, que a BrasilAPI recusa) é "não encontrado" nesta fonte', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(BRASIL_API_BAD_REQUEST, 400))

    expect(await lookupBrasilApi('9780132350884', options(fetchImpl))).toEqual({
      status: LOOKUP_STATUS.notFound,
    })
  })
})

describe('falhas da BrasilAPI viram "fonte indisponível", sem exceção', () => {
  const unavailable = { status: LOOKUP_STATUS.unavailable }

  it.each([403, 429, 500, 502, 503])('HTTP %i', async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'x' }, status))

    expect(await lookupBrasilApi('9788535914849', options(fetchImpl))).toEqual(
      unavailable,
    )
  })

  it('erro de rede', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))

    expect(await lookupBrasilApi('9788535914849', options(fetchImpl))).toEqual(
      unavailable,
    )
  })

  it('tempo esgotado', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )

    expect(await lookupBrasilApi('9788535914849', options(fetchImpl))).toEqual(
      unavailable,
    )
  })

  it('resposta que não é JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>erro</html>', { status: 200 }))

    expect(await lookupBrasilApi('9788535914849', options(fetchImpl))).toEqual(
      unavailable,
    )
  })

  it('resposta fora do formato', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ title: 123, authors: 'não é lista' }))

    expect(await lookupBrasilApi('9788535914849', options(fetchImpl))).toEqual(
      unavailable,
    )
  })
})
