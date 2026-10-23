import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START } from '../../../test-support/clock.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import type { AppError } from '../../../shared/errors.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  lookupOpenLibrary: vi.fn(),
  lookupBrasilApi: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../book-metadata/open-library.client.js', () => ({
  lookupOpenLibrary: h.lookupOpenLibrary,
}))
vi.mock('../book-metadata/brasil-api.client.js', () => ({
  lookupBrasilApi: h.lookupBrasilApi,
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { lookupBookByIsbn, lookupBookMetadata, syncBookMetadata } =
  await import('../services/book-metadata.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { LOOKUP_STATUS } = await import('../catalog.constants.js')
const { makeBook } = await import('./book.fixtures.js')
const { NOT_FOUND, UNAVAILABLE, foundBy } =
  await import('./book-metadata.fixtures.js')

const LIBRARIAN = { uid: 'uid_ana', role: 'librarian' } as const
const SYSTEM = { uid: 'system', role: 'system' } as const

// O que cada fonte devolve para o ISBN, já mapeado.
const openLibraryData = foundBy(
  {
    title: 'Código Limpo (Open Library)',
    authors: ['Robert Cecil Martin'],
    publisher: 'Editora OL',
    year: 2024,
    coverUrl: 'https://covers.openlibrary.org/c.jpg',
  },
  '/books/OL999M',
)
const brasilApiData = foundBy({
  title: 'Código Limpo (BrasilAPI)',
  synopsis: 'Sinopse da BrasilAPI.',
})

// As duas fontes acham o livro: Open Library primeiro, sinopse da BrasilAPI.
function bothFind() {
  h.lookupOpenLibrary.mockResolvedValue(openLibraryData)
  h.lookupBrasilApi.mockResolvedValue(brasilApiData)
}

function seedBook(overrides: Parameters<typeof makeBook>[0] = {}) {
  const book = makeBook({ id: 'book1', ...overrides })
  const data: Record<string, unknown> = { ...book }
  delete data.id
  h.db.put('books', 'book1', data)
  return data
}

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.then(
    () => undefined,
    (error: unknown) => error,
  )) as AppError
}

beforeEach(() => {
  h.db = new Fake()
  h.lookupOpenLibrary.mockReset()
  h.lookupBrasilApi.mockReset()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('consulta às duas fontes (lookupBookMetadata)', () => {
  it('consulta as duas com o mesmo ISBN, ao mesmo tempo, e combina', async () => {
    let releaseOpenLibrary: (value: unknown) => void = () => {}
    h.lookupOpenLibrary.mockReturnValue(
      new Promise((resolve) => {
        releaseOpenLibrary = resolve
      }),
    )
    h.lookupBrasilApi.mockResolvedValue(brasilApiData)

    const pending = lookupBookMetadata('9788576082675')

    // A BrasilAPI é chamada sem esperar a Open Library responder.
    expect(h.lookupOpenLibrary).toHaveBeenCalledWith('9788576082675')
    expect(h.lookupBrasilApi).toHaveBeenCalledWith('9788576082675')
    releaseOpenLibrary(openLibraryData)

    expect(await pending).toMatchObject({
      status: LOOKUP_STATUS.found,
      sources: ['open_library', 'brasil_api'],
      data: {
        title: 'Código Limpo (Open Library)',
        synopsis: 'Sinopse da BrasilAPI.',
      },
    })
  })

  it('nunca lança: fonte indisponível vira resultado', async () => {
    h.lookupOpenLibrary.mockResolvedValue(UNAVAILABLE)
    h.lookupBrasilApi.mockResolvedValue(NOT_FOUND)

    expect(await lookupBookMetadata('9788576082675')).toEqual({
      status: LOOKUP_STATUS.unavailable,
    })
  })
})

describe('consulta do ISBN para pré-preencher o cadastro (lookupBookByIsbn)', () => {
  it('devolve os dados combinados, as fontes e a chave, sem gravar nada', async () => {
    bothFind()

    expect(await lookupBookByIsbn('9788576082675')).toEqual({
      found: true,
      sources: ['open_library', 'brasil_api'],
      openLibraryKey: '/books/OL999M',
      book: {
        title: 'Código Limpo (Open Library)',
        authors: ['Robert Cecil Martin'],
        publisher: 'Editora OL',
        year: 2024,
        coverUrl: 'https://covers.openlibrary.org/c.jpg',
        synopsis: 'Sinopse da BrasilAPI.',
      },
    })
    expect(h.db.all('books')).toEqual([])
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('só a BrasilAPI achou: openLibraryKey volta null', async () => {
    h.lookupOpenLibrary.mockResolvedValue(NOT_FOUND)
    h.lookupBrasilApi.mockResolvedValue(brasilApiData)

    expect(await lookupBookByIsbn('9788576082675')).toMatchObject({
      found: true,
      sources: ['brasil_api'],
      openLibraryKey: null,
    })
  })

  it('ISBN que nenhuma fonte conhece volta found false, não é erro', async () => {
    h.lookupOpenLibrary.mockResolvedValue(NOT_FOUND)
    h.lookupBrasilApi.mockResolvedValue(NOT_FOUND)

    expect(await lookupBookByIsbn('9788576082675')).toEqual({
      found: false,
      sources: [],
      openLibraryKey: null,
      book: null,
    })
  })

  it('nenhuma achou e alguma não respondeu sobe como 502', async () => {
    h.lookupOpenLibrary.mockResolvedValue(UNAVAILABLE)
    h.lookupBrasilApi.mockResolvedValue(NOT_FOUND)

    expect(await catchError(lookupBookByIsbn('9788576082675'))).toMatchObject({
      status: 502,
      code: 'book_metadata_unavailable',
    })
  })

  it('uma fonte fora do ar não impede a outra de preencher o cadastro', async () => {
    h.lookupOpenLibrary.mockResolvedValue(UNAVAILABLE)
    h.lookupBrasilApi.mockResolvedValue(brasilApiData)

    expect(await lookupBookByIsbn('9788576082675')).toMatchObject({
      found: true,
      sources: ['brasil_api'],
    })
  })
})

describe('atualização pelas fontes externas (syncBookMetadata)', () => {
  it('troca só os campos permitidos e devolve os que mudaram', async () => {
    seedBook()
    bothFind()

    const response = await syncBookMetadata('book1', LIBRARIAN)

    expect(h.lookupOpenLibrary).toHaveBeenCalledWith('9788576082675')
    expect(h.lookupBrasilApi).toHaveBeenCalledWith('9788576082675')
    expect(response.changedFields).toEqual([
      'title',
      'authors',
      'publisher',
      'year',
      'synopsis',
      'coverUrl',
    ])
    expect(response.book).toMatchObject({
      id: 'book1',
      title: 'Código Limpo (Open Library)',
      publisher: 'Editora OL',
      year: 2024,
      synopsis: 'Sinopse da BrasilAPI.',
      dataSource: 'external',
      externalMetadata: {
        sources: ['open_library', 'brasil_api'],
        openLibraryKey: '/books/OL999M',
        lastSyncedAt: START.toISOString(),
        found: true,
      },
    })
  })

  it('nunca muda CDU, Cutter, estante, local, idioma, contadores, workId, status nem exemplares', async () => {
    seedBook()
    h.db.put('copies', 'c1', { bookId: 'book1', status: 'on_loan' })
    bothFind()

    await syncBookMetadata('book1', LIBRARIAN)

    expect(h.db.read('books', 'book1')).toMatchObject({
      cdu: '005.1',
      cutter: 'M386c',
      shelf: 'Estante 005.1',
      location: 'Biblioteca (Praça Central)',
      language: 'Português',
      workId: 'codigo-limpo--martin',
      status: 'active',
      copiesTotal: 3,
      copiesAvailable: 0,
      queueLength: 1,
      isbn: '9788576082675',
    })
    expect(h.db.read('copies', 'c1')).toEqual({
      bookId: 'book1',
      status: 'on_loan',
    })
  })

  it('refaz o texto de busca', async () => {
    seedBook()
    bothFind()

    await syncBookMetadata('book1', LIBRARIAN)

    expect(h.db.read('books', 'book1')?.searchText).toContain(
      'codigo limpo (open library)',
    )
  })

  it('registra book_sync_external no auditLog, com o ator do pedido', async () => {
    seedBook()
    bothFind()

    await syncBookMetadata('book1', LIBRARIAN)

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: 'uid_ana',
        actorRole: 'librarian',
        action: 'book_sync_external',
        bookId: 'book1',
        details: expect.objectContaining({ found: true }),
        createdAt: START,
      }),
    ])
  })

  it('o script de importação registra o ator "system"', async () => {
    seedBook()
    bothFind()

    await syncBookMetadata('book1', SYSTEM)

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({ actorUid: 'system', actorRole: 'system' }),
    ])
  })

  it('com só uma fonte, atualiza com ela e deixa o resto como estava', async () => {
    seedBook()
    h.lookupOpenLibrary.mockResolvedValue(UNAVAILABLE)
    h.lookupBrasilApi.mockResolvedValue(brasilApiData)

    const response = await syncBookMetadata('book1', LIBRARIAN)

    expect(response.changedFields).toEqual(['title', 'synopsis'])
    expect(response.book.externalMetadata).toMatchObject({
      sources: ['brasil_api'],
      found: true,
    })
    expect(response.book.publisher).toBe('Alta Books')
  })

  it('ISBN não encontrado grava só externalMetadata e não altera mais nada', async () => {
    const before = seedBook()
    h.lookupOpenLibrary.mockResolvedValue(NOT_FOUND)
    h.lookupBrasilApi.mockResolvedValue(NOT_FOUND)

    const response = await syncBookMetadata('book1', LIBRARIAN)

    expect(response.changedFields).toEqual([])
    expect(response.book.externalMetadata).toEqual({
      sources: [],
      openLibraryKey: null,
      lastSyncedAt: START.toISOString(),
      found: false,
    })
    expect(h.db.read('books', 'book1')).toEqual({
      ...before,
      externalMetadata: { sources: [], lastSyncedAt: START, found: false },
      updatedAt: START,
    })
    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({ found: false }),
      }),
    ])
  })

  it('nenhuma fonte achou e alguma não respondeu: 502, sem alterar o livro nem auditar', async () => {
    const before = seedBook()
    h.lookupOpenLibrary.mockResolvedValue(UNAVAILABLE)
    h.lookupBrasilApi.mockResolvedValue(UNAVAILABLE)

    const error = await catchError(syncBookMetadata('book1', LIBRARIAN))

    expect(error).toMatchObject({
      status: 502,
      code: 'book_metadata_unavailable',
    })
    expect(h.db.read('books', 'book1')).toEqual(before)
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('livro sem ISBN responde 422 isbn_required, sem consultar as fontes', async () => {
    seedBook({ isbn: undefined })

    const error = await catchError(syncBookMetadata('book1', LIBRARIAN))

    expect(error).toMatchObject({ status: 422, code: 'isbn_required' })
    expect(h.lookupOpenLibrary).not.toHaveBeenCalled()
    expect(h.lookupBrasilApi).not.toHaveBeenCalled()
  })

  it('responde 404 para livro inexistente ou removido', async () => {
    seedBook({ status: 'removed' })

    for (const id of ['nao-existe', 'book1']) {
      expect(await catchError(syncBookMetadata(id, LIBRARIAN))).toMatchObject({
        status: 404,
        code: 'book_not_found',
      })
    }
  })

  it('invalida o cache da busca, mas não quando as fontes falham', async () => {
    seedBook()
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    h.lookupOpenLibrary.mockResolvedValueOnce(UNAVAILABLE)
    h.lookupBrasilApi.mockResolvedValueOnce(UNAVAILABLE)
    await catchError(syncBookMetadata('book1', LIBRARIAN))
    await getCachedActiveBooks(load)
    expect(load).toHaveBeenCalledTimes(1)

    bothFind()
    await syncBookMetadata('book1', LIBRARIAN)
    await getCachedActiveBooks(load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
