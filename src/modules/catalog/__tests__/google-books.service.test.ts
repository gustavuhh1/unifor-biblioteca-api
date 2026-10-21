import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START } from '../../../test-support/clock.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import type { AppError } from '../../../shared/errors.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  lookupIsbn: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../google-books/google-books.client.js', () => ({
  lookupIsbn: h.lookupIsbn,
  fetchVolume: vi.fn(),
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { lookupGoogleBook, syncBookFromGoogle } =
  await import('../services/google-books.service.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { googleBooksUnavailable } = await import('../catalog.errors.js')
const { makeBook } = await import('./book.fixtures.js')

const LIBRARIAN = { uid: 'uid_ana', role: 'librarian' } as const
const SYSTEM = { uid: 'system', role: 'system' } as const

// O que o Google Books devolve para o ISBN, já mapeado.
const googleData = {
  found: true,
  volumeId: 'vol999',
  data: {
    title: 'Código Limpo (Google)',
    authors: ['Robert Cecil Martin'],
    publisher: 'Editora do Google',
    year: 2024,
    synopsis: 'Sinopse do Google.',
    coverUrl: 'https://books.google.com/c.jpg',
    language: 'Português',
  },
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
  h.lookupIsbn.mockReset()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('consulta do ISBN para pré-preencher o cadastro (lookupGoogleBook)', () => {
  it('devolve os dados mapeados e o volumeId, sem gravar nada', async () => {
    h.lookupIsbn.mockResolvedValue(googleData)

    expect(await lookupGoogleBook('9788576082675')).toEqual({
      found: true,
      volumeId: 'vol999',
      book: googleData.data,
    })
    expect(h.lookupIsbn).toHaveBeenCalledWith('9788576082675')
    expect(h.db.all('books')).toEqual([])
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('ISBN não encontrado volta found false, não é erro', async () => {
    h.lookupIsbn.mockResolvedValue({ found: false })

    expect(await lookupGoogleBook('9788576082675')).toEqual({
      found: false,
      volumeId: null,
      book: null,
    })
  })

  it('falha do Google sobe como 502', async () => {
    h.lookupIsbn.mockRejectedValue(googleBooksUnavailable())

    expect(await catchError(lookupGoogleBook('9788576082675'))).toMatchObject({
      status: 502,
      code: 'google_books_unavailable',
    })
  })
})

describe('atualização pelo Google Books (syncBookFromGoogle)', () => {
  it('troca só os campos permitidos e devolve os que mudaram', async () => {
    seedBook()
    h.lookupIsbn.mockResolvedValue(googleData)

    const response = await syncBookFromGoogle('book1', LIBRARIAN)

    expect(h.lookupIsbn).toHaveBeenCalledWith('9788576082675')
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
      title: 'Código Limpo (Google)',
      publisher: 'Editora do Google',
      year: 2024,
      dataSource: 'google_books',
      googleBooks: {
        volumeId: 'vol999',
        lastSyncedAt: START.toISOString(),
        found: true,
      },
    })
  })

  it('nunca muda CDU, Cutter, estante, local, contadores, workId, status nem exemplares', async () => {
    seedBook()
    h.db.put('copies', 'c1', { bookId: 'book1', status: 'on_loan' })
    h.lookupIsbn.mockResolvedValue(googleData)

    await syncBookFromGoogle('book1', LIBRARIAN)

    expect(h.db.read('books', 'book1')).toMatchObject({
      cdu: '005.1',
      cutter: 'M386c',
      shelf: 'Estante 005.1',
      location: 'Biblioteca (Praça Central)',
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
    h.lookupIsbn.mockResolvedValue(googleData)

    await syncBookFromGoogle('book1', LIBRARIAN)

    expect(h.db.read('books', 'book1')?.searchText).toContain(
      'codigo limpo (google)',
    )
  })

  it('registra book_sync_google no auditLog, com o ator do pedido', async () => {
    seedBook()
    h.lookupIsbn.mockResolvedValue(googleData)

    await syncBookFromGoogle('book1', LIBRARIAN)

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: 'uid_ana',
        actorRole: 'librarian',
        action: 'book_sync_google',
        bookId: 'book1',
        details: expect.objectContaining({ found: true }),
        createdAt: START,
      }),
    ])
  })

  it('o script de importação registra o ator "system"', async () => {
    seedBook()
    h.lookupIsbn.mockResolvedValue(googleData)

    await syncBookFromGoogle('book1', SYSTEM)

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({ actorUid: 'system', actorRole: 'system' }),
    ])
  })

  it('ISBN não encontrado grava só googleBooks e não altera mais nada', async () => {
    const before = seedBook()
    h.lookupIsbn.mockResolvedValue({ found: false })

    const response = await syncBookFromGoogle('book1', LIBRARIAN)

    expect(response.changedFields).toEqual([])
    expect(response.book.googleBooks).toEqual({
      volumeId: 'vol123',
      lastSyncedAt: START.toISOString(),
      found: false,
    })
    expect(h.db.read('books', 'book1')).toEqual({
      ...before,
      googleBooks: { volumeId: 'vol123', lastSyncedAt: START, found: false },
      updatedAt: START,
    })
  })

  it('falha do Google responde 502 sem alterar o livro nem auditar', async () => {
    const before = seedBook()
    h.lookupIsbn.mockRejectedValue(googleBooksUnavailable())

    const error = await catchError(syncBookFromGoogle('book1', LIBRARIAN))

    expect(error).toMatchObject({
      status: 502,
      code: 'google_books_unavailable',
    })
    expect(h.db.read('books', 'book1')).toEqual(before)
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('livro sem ISBN responde 422 isbn_required, sem consultar o Google', async () => {
    seedBook({ isbn: undefined })

    const error = await catchError(syncBookFromGoogle('book1', LIBRARIAN))

    expect(error).toMatchObject({ status: 422, code: 'isbn_required' })
    expect(h.lookupIsbn).not.toHaveBeenCalled()
  })

  it('responde 404 para livro inexistente ou removido', async () => {
    seedBook({ status: 'removed' })

    for (const id of ['nao-existe', 'book1']) {
      expect(await catchError(syncBookFromGoogle(id, LIBRARIAN))).toMatchObject(
        { status: 404, code: 'book_not_found' },
      )
    }
  })

  it('invalida o cache da busca, mas não quando o Google falha', async () => {
    seedBook()
    const load = vi.fn().mockResolvedValue([])
    await getCachedActiveBooks(load)

    h.lookupIsbn.mockRejectedValueOnce(googleBooksUnavailable())
    await catchError(syncBookFromGoogle('book1', LIBRARIAN))
    await getCachedActiveBooks(load)
    expect(load).toHaveBeenCalledTimes(1)

    h.lookupIsbn.mockResolvedValueOnce(googleData)
    await syncBookFromGoogle('book1', LIBRARIAN)
    await getCachedActiveBooks(load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
