import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../../shared/errors.js'
import { fetchVolume, lookupIsbn } from '../google-books/google-books.client.js'

// Valor de mentira: só serve para provar que a chave nunca vaza.
const API_KEY = 'chave-falsa-de-teste'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const volume = {
  volumeInfo: {
    title: 'Código Limpo',
    authors: ['Robert C. Martin'],
    publisher: 'Alta Books',
    publishedDate: '2011',
    description: '<p>Sinopse</p>',
    language: 'pt',
    imageLinks: { thumbnail: 'http://books.google.com/c.jpg' },
  },
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const options = (fetchImpl: typeof fetch) => ({
  fetchImpl,
  apiKey: API_KEY,
  timeoutMs: 50,
})

// Confere que o erro é o 502 tipado e que nada do que ele ou o log mostram tem
// a chave nem a URL da consulta.
function expectUnavailableWithoutLeaks(error: unknown) {
  expect(error).toBeInstanceOf(AppError)
  expect(error).toMatchObject({
    status: 502,
    code: 'google_books_unavailable',
  })
  const shown = JSON.stringify([
    (error as AppError).message,
    (error as AppError).extra,
    warn.mock.calls,
  ])
  expect(shown).not.toContain(API_KEY)
  expect(shown).not.toContain('googleapis.com')
}

describe('consulta do ISBN no Google Books (lookupIsbn)', () => {
  it('faz exatamente 2 chamadas: a busca por ISBN e o volume do primeiro item', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ totalItems: 1, items: [{ id: 'vol1' }] }))
      .mockResolvedValueOnce(json(volume))

    const result = await lookupIsbn('9788576082675', options(fetchImpl))

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [first, second] = fetchImpl.mock.calls.map(([url]) => String(url))
    expect(first).toContain('/books/v1/volumes?q=isbn:9788576082675')
    expect(second).toContain('/books/v1/volumes/vol1?')
    expect(result).toEqual({
      found: true,
      volumeId: 'vol1',
      data: {
        title: 'Código Limpo',
        authors: ['Robert C. Martin'],
        publisher: 'Alta Books',
        year: 2011,
        synopsis: 'Sinopse',
        language: 'Português',
        coverUrl: 'https://books.google.com/c.jpg',
      },
    })
  })

  it('manda a chave e um tempo máximo em cada chamada', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ totalItems: 1, items: [{ id: 'vol1' }] }))
      .mockResolvedValueOnce(json(volume))

    await lookupIsbn('9788576082675', options(fetchImpl))

    for (const [url, init] of fetchImpl.mock.calls) {
      expect(String(url)).toContain(`key=${API_KEY}`)
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('ISBN sem resultado (totalItems 0) volta found false, com uma chamada só', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ totalItems: 0 }))

    expect(await lookupIsbn('9788576082675', options(fetchImpl))).toEqual({
      found: false,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('trata resposta sem itens como ISBN não encontrado', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ totalItems: 1, items: [] }))

    expect(await lookupIsbn('9788576082675', options(fetchImpl))).toEqual({
      found: false,
    })
  })
})

describe('consulta do volume (fetchVolume)', () => {
  it('devolve os dados mapeados do volume', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(volume))

    expect(await fetchVolume('vol1', options(fetchImpl))).toMatchObject({
      title: 'Código Limpo',
      year: 2011,
    })
  })
})

describe('falhas do Google Books', () => {
  it.each([400, 403, 404, 429, 500, 503])(
    'responde 502 google_books_unavailable para o HTTP %i',
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ error: 'x' }, status))

      const error = await lookupIsbn('9788576082675', options(fetchImpl)).catch(
        (e: unknown) => e,
      )

      expectUnavailableWithoutLeaks(error)
    },
  )

  it('responde 502 quando a rede falha', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))

    const error = await lookupIsbn('9788576082675', options(fetchImpl)).catch(
      (e: unknown) => e,
    )

    expectUnavailableWithoutLeaks(error)
  })

  it('responde 502 quando o tempo esgota', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )

    const error = await lookupIsbn('9788576082675', options(fetchImpl)).catch(
      (e: unknown) => e,
    )

    expectUnavailableWithoutLeaks(error)
  })

  it('responde 502 quando a segunda chamada falha, depois de achar o ISBN', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ totalItems: 1, items: [{ id: 'vol1' }] }))
      .mockResolvedValueOnce(json({}, 503))

    const error = await lookupIsbn('9788576082675', options(fetchImpl)).catch(
      (e: unknown) => e,
    )

    expectUnavailableWithoutLeaks(error)
  })

  it('responde 502 quando a resposta não é um JSON válido', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<html>erro</html>', { status: 200 }))

    const error = await lookupIsbn('9788576082675', options(fetchImpl)).catch(
      (e: unknown) => e,
    )

    expectUnavailableWithoutLeaks(error)
  })

  it('responde 502, sem chamar a rede, quando a chave não está configurada', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    const error = await lookupIsbn('9788576082675', {
      fetchImpl,
      apiKey: undefined,
    }).catch((e: unknown) => e)

    expect(fetchImpl).not.toHaveBeenCalled()
    expectUnavailableWithoutLeaks(error)
  })
})
