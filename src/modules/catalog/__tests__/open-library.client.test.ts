import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lookupOpenLibrary } from '../book-metadata/open-library.client.js'
import {
  BOOK_METADATA_USER_AGENT,
  LOOKUP_STATUS,
} from '../catalog.constants.js'
import {
  OPEN_LIBRARY_1984,
  OPEN_LIBRARY_CLEAN_CODE,
  jsonResponse,
} from './book-metadata.fixtures.js'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const options = (fetchImpl: typeof fetch) => ({ fetchImpl, timeoutMs: 50 })

describe('consulta do ISBN na Open Library (lookupOpenLibrary)', () => {
  it('faz uma chamada a api/books com o ISBN e devolve os dados mapeados e a chave', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(OPEN_LIBRARY_CLEAN_CODE))

    const result = await lookupOpenLibrary('9780132350884', options(fetchImpl))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://openlibrary.org/api/books?bibkeys=ISBN%3A9780132350884&format=json&jscmd=data',
    )
    expect(result).toEqual({
      status: LOOKUP_STATUS.found,
      openLibraryKey: '/books/OL26222911M',
      data: {
        title: 'Clean Code',
        subtitle: 'A Handbook of Agile Software Craftsmanship',
        authors: ['Robert C. Martin'],
        publisher: 'Prentice Hall',
        year: 2008,
        subjects: expect.any(Array),
        coverUrl: 'https://covers.openlibrary.org/b/id/15126503-L.jpg',
      },
    })
  })

  it('identifica o app com o User-Agent e põe um tempo máximo na chamada', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(OPEN_LIBRARY_1984))

    await lookupOpenLibrary('9788535914849', options(fetchImpl))

    const init = fetchImpl.mock.calls[0]![1]
    expect(init?.headers).toMatchObject({
      'user-agent': BOOK_METADATA_USER_AGENT,
    })
    expect(BOOK_METADATA_USER_AGENT).toBe(
      'UniBooks/1.0 (+https://uni-books.app)',
    )
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('ISBN desconhecido (objeto vazio) é "não encontrado"', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}))

    expect(
      await lookupOpenLibrary('9780000000002', options(fetchImpl)),
    ).toEqual({
      status: LOOKUP_STATUS.notFound,
    })
  })

  it('livro sem chave na resposta volta sem openLibraryKey', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ 'ISBN:9780000000002': { title: 'A' } }))

    const result = await lookupOpenLibrary('9780000000002', options(fetchImpl))

    expect(result).toEqual({
      status: LOOKUP_STATUS.found,
      data: { title: 'A' },
    })
  })
})

describe('falhas da Open Library viram "fonte indisponível", sem exceção', () => {
  const unavailable = { status: LOOKUP_STATUS.unavailable }

  it.each([403, 429, 500, 502, 503])('HTTP %i', async (status) => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'x' }, status))

    expect(
      await lookupOpenLibrary('9788535914849', options(fetchImpl)),
    ).toEqual(unavailable)
    expect(warn.mock.calls.flat().join(' ')).toContain(`HTTP ${status}`)
  })

  it('erro de rede', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))

    expect(
      await lookupOpenLibrary('9788535914849', options(fetchImpl)),
    ).toEqual(unavailable)
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

    expect(
      await lookupOpenLibrary('9788535914849', options(fetchImpl)),
    ).toEqual(unavailable)
    expect(warn.mock.calls.flat().join(' ')).toMatch(/TimeoutError/)
  })

  it('resposta que não é JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>erro</html>', { status: 200 }))

    expect(
      await lookupOpenLibrary('9788535914849', options(fetchImpl)),
    ).toEqual(unavailable)
  })

  it('resposta fora do formato', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(['não', 'é', 'um', 'objeto']))

    expect(
      await lookupOpenLibrary('9788535914849', options(fetchImpl)),
    ).toEqual(unavailable)
  })

  it('o log não mostra a URL da consulta', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(
        new TypeError('fetch failed: https://openlibrary.org/x'),
      )

    await lookupOpenLibrary('9788535914849', options(fetchImpl))

    expect(JSON.stringify(warn.mock.calls)).not.toContain('openlibrary.org')
  })
})
