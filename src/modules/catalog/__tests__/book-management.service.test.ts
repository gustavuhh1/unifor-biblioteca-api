import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { START } from '../../../test-support/clock.js'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'
import type { AppError } from '../../../shared/errors.js'

const h = vi.hoisted(() => ({
  db: undefined as unknown as FakeFirestore,
  fetchVolume: vi.fn(),
}))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))
vi.mock('../google-books/google-books.client.js', () => ({
  fetchVolume: h.fetchVolume,
  lookupIsbn: vi.fn(),
}))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { createBook, removeBook, updateBook } =
  await import('../services/book-management.service.js')
const { createBookBodySchema, updateBookBodySchema } =
  await import('../schemas/request.schemas.js')
const { getCachedActiveBooks, invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { googleBooksUnavailable } = await import('../catalog.errors.js')
const { makeBook, makeCopy } = await import('./book.fixtures.js')

const LIBRARIAN = { uid: 'uid_ana', role: 'librarian' } as const

const newBook = (overrides: Record<string, unknown> = {}) =>
  createBookBodySchema.parse({
    isbn: '978-85-7608-267-5',
    title: 'Código Limpo',
    authors: ['Robert C. Martin'],
    subjects: ['Programação'],
    cdu: '005.1',
    cutter: 'M386c',
    shelf: 'Estante 005.1',
    copies: [
      { registration: '46122', libraryCode: '1163 · Biblioteca · Livros' },
      { registration: '223223', libraryCode: '1163 · Biblioteca · Livros' },
    ],
    ...overrides,
  })

const edit = (patch: Record<string, unknown>) =>
  updateBookBodySchema.parse(patch)

// Guarda o livro e os exemplares no banco falso.
function seedBook(
  id: string,
  book: Parameters<typeof makeBook>[0] = {},
  copyStatuses: ('available' | 'reserved' | 'on_loan' | 'withdrawn')[] = [
    'available',
  ],
) {
  const data: Record<string, unknown> = { ...makeBook({ id, ...book }) }
  delete data.id
  h.db.put('books', id, data)
  copyStatuses.forEach((status, index) =>
    h.db.put(
      'copies',
      `copy_${id}_${index}`,
      makeCopy({ bookId: id, registration: `r${id}${index}`, status }),
    ),
  )
}

async function catchError(promise: Promise<unknown>): Promise<AppError> {
  return (await promise.then(
    () => undefined,
    (error: unknown) => error,
  )) as AppError
}

// Diz quantas vezes o acervo foi recarregado do banco depois desta chamada.
async function cacheWasInvalidated(run: () => Promise<unknown>) {
  const load = vi.fn().mockResolvedValue([])
  await getCachedActiveBooks(load)
  await run()
  await getCachedActiveBooks(load)
  return load.mock.calls.length === 2
}

beforeEach(() => {
  h.db = new Fake()
  h.fetchVolume.mockReset()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cadastro de livro (createBook)', () => {
  it('cria a obra, o livro e os exemplares numa transação', async () => {
    const response = await createBook(newBook(), LIBRARIAN)

    expect(response).toMatchObject({
      workId: 'codigo-limpo--martin',
      isbn: '9788576082675',
      status: 'active',
      copiesTotal: 2,
      copiesAvailable: 2,
      queueLength: 0,
      createdBy: 'uid_ana',
      dataSource: 'manual',
    })
    expect(response).not.toHaveProperty('searchText')

    expect(h.db.read('works', 'codigo-limpo--martin')).toMatchObject({
      title: 'Código Limpo',
      authors: ['Robert C. Martin'],
      bookIds: [response.id],
      editionCount: 1,
    })
    const stored = h.db.read('books', response.id)
    expect(stored).toMatchObject({
      status: 'active',
      coverTone: expect.any(Number),
      searchText: 'codigo limpo robert c. martin programacao 9788576082675',
      createdAt: START,
    })
    const copies = h.db.all('copies')
    expect(copies).toHaveLength(2)
    expect(copies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookId: response.id,
          workId: 'codigo-limpo--martin',
          registration: '46122',
          status: 'available',
          format: 'Impresso',
        }),
      ]),
    )
  })

  it('acrescenta a edição à obra que já existe', async () => {
    h.db.put('works', 'codigo-limpo--martin', {
      title: 'Código Limpo',
      authors: ['Robert C. Martin'],
      bookIds: ['book_antiga'],
      editionCount: 1,
    })

    const response = await createBook(
      newBook({ edition: '2. ed.', isbn: undefined }),
      LIBRARIAN,
    )

    expect(h.db.read('works', 'codigo-limpo--martin')).toMatchObject({
      bookIds: ['book_antiga', response.id],
      editionCount: 2,
    })
    expect(h.db.all('works')).toHaveLength(1)
  })

  it('registra book_create no auditLog', async () => {
    const response = await createBook(newBook(), LIBRARIAN)

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        actorUid: 'uid_ana',
        actorRole: 'librarian',
        action: 'book_create',
        bookId: response.id,
        createdAt: START,
      }),
    ])
  })

  it('recusa com 409 o registro que já existe no banco e não grava nada', async () => {
    h.db.put('copies', 'copy_existente', makeCopy({ registration: '223223' }))

    const error = await catchError(createBook(newBook(), LIBRARIAN))

    expect(error).toMatchObject({
      status: 409,
      code: 'registration_taken',
      extra: {
        fields: [
          {
            field: 'copies.1.registration',
            message: 'O registro 223223 já existe no acervo.',
          },
        ],
      },
    })
    expect(h.db.all('books')).toEqual([])
    expect(h.db.all('works')).toEqual([])
    expect(h.db.all('copies')).toHaveLength(1)
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('recusa com 409 o registro repetido no próprio corpo', async () => {
    const error = await catchError(
      createBook(
        newBook({
          copies: [
            { registration: '1', libraryCode: 'x' },
            { registration: '1', libraryCode: 'x' },
          ],
        }),
        LIBRARIAN,
      ),
    )

    expect(error).toMatchObject({
      status: 409,
      code: 'registration_taken',
      extra: { fields: [{ field: 'copies.1.registration' }] },
    })
    expect(h.db.all('books')).toEqual([])
  })

  describe('dados do Google Books', () => {
    const volume = {
      title: 'Código Limpo',
      authors: ['Robert C. Martin'],
      publisher: 'Alta Books',
      synopsis: 'Sinopse do Google.',
    }
    const fromGoogle = {
      volumeId: 'vol1',
      publisher: 'Alta Books',
      synopsis: 'Sinopse do Google.',
    }

    it('com volumeId e nada alterado à mão grava google_books', async () => {
      h.fetchVolume.mockResolvedValue(volume)

      const response = await createBook(newBook(fromGoogle), LIBRARIAN)

      expect(h.fetchVolume).toHaveBeenCalledWith('vol1')
      expect(response.dataSource).toBe('google_books')
      expect(response.googleBooks).toEqual({
        volumeId: 'vol1',
        lastSyncedAt: START.toISOString(),
        found: true,
      })
    })

    it('com volumeId e algum campo alterado à mão grava mixed', async () => {
      h.fetchVolume.mockResolvedValue(volume)

      const response = await createBook(
        newBook({ ...fromGoogle, publisher: 'Outra Editora' }),
        LIBRARIAN,
      )

      expect(response.dataSource).toBe('mixed')
      expect(response.googleBooks?.found).toBe(true)
    })

    it('segue com o cadastro, como mixed, se o Google falhar na conferência', async () => {
      h.fetchVolume.mockRejectedValue(googleBooksUnavailable())

      const response = await createBook(newBook(fromGoogle), LIBRARIAN)

      expect(response.dataSource).toBe('mixed')
      expect(response.googleBooks).toMatchObject({
        volumeId: 'vol1',
        found: true,
      })
    })

    it('com ISBN e sem volumeId grava googleBooks.found false e dataSource manual', async () => {
      const response = await createBook(newBook(), LIBRARIAN)

      expect(h.fetchVolume).not.toHaveBeenCalled()
      expect(response.googleBooks).toEqual({
        volumeId: null,
        lastSyncedAt: null,
        found: false,
      })
      expect(response.dataSource).toBe('manual')
    })

    it('sem ISBN omite o googleBooks', async () => {
      const response = await createBook(newBook({ isbn: undefined }), LIBRARIAN)

      expect(response.googleBooks).toBeNull()
      expect(response.isbn).toBeNull()
    })
  })

  it('invalida o cache da busca', async () => {
    expect(
      await cacheWasInvalidated(() => createBook(newBook(), LIBRARIAN)),
    ).toBe(true)
  })

  it('não invalida o cache quando o cadastro falha', async () => {
    h.db.put('copies', 'copy_existente', makeCopy({ registration: '46122' }))

    expect(
      await cacheWasInvalidated(() =>
        catchError(createBook(newBook(), LIBRARIAN)),
      ),
    ).toBe(false)
  })
})

describe('edição de livro (updateBook)', () => {
  beforeEach(() => seedBook('book1'))

  it('grava os campos alterados, refaz o texto de busca e devolve o livro', async () => {
    const response = await updateBook(
      'book1',
      edit({ title: 'Clean Code', shelf: 'Estante 005.2' }),
      LIBRARIAN,
    )

    expect(response).toMatchObject({
      id: 'book1',
      title: 'Clean Code',
      shelf: 'Estante 005.2',
    })
    expect(h.db.read('books', 'book1')).toMatchObject({
      title: 'Clean Code',
      shelf: 'Estante 005.2',
      updatedAt: START,
      searchText: expect.stringContaining('clean code'),
    })
  })

  it('registra book_update com os campos alterados', async () => {
    await updateBook('book1', edit({ shelf: 'Estante 005.2' }), LIBRARIAN)

    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        action: 'book_update',
        actorUid: 'uid_ana',
        bookId: 'book1',
        details: { fields: ['shelf'] },
      }),
    ])
  })

  it('não muda workId, contadores, status nem exemplares', async () => {
    await updateBook('book1', edit({ title: 'Outro' }), LIBRARIAN)

    expect(h.db.read('books', 'book1')).toMatchObject({
      workId: 'codigo-limpo--martin',
      copiesTotal: 3,
      queueLength: 1,
      status: 'active',
    })
    expect(h.db.read('copies', 'copy_book1_0')).toMatchObject({
      status: 'available',
    })
  })

  it('marcar como indisponível grava quando e quem, e registra book_set_unavailable', async () => {
    const response = await updateBook(
      'book1',
      edit({ unavailableForNewRequests: true }),
      LIBRARIAN,
    )

    expect(response).toMatchObject({
      unavailableForNewRequests: true,
      unavailableSetAt: START.toISOString(),
      unavailableSetBy: 'uid_ana',
    })
    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        action: 'book_set_unavailable',
        details: { unavailable: true },
      }),
    ])
  })

  it('desmarcar limpa quando e quem tinha marcado', async () => {
    seedBook('book2', {
      unavailableForNewRequests: true,
      unavailableSetAt: START,
      unavailableSetBy: 'uid_outra',
    })

    const response = await updateBook(
      'book2',
      edit({ unavailableForNewRequests: false }),
      LIBRARIAN,
    )

    expect(response).toMatchObject({
      unavailableForNewRequests: false,
      unavailableSetAt: null,
      unavailableSetBy: null,
    })
    const stored = h.db.read('books', 'book2')
    expect(stored).not.toHaveProperty('unavailableSetAt')
    expect(stored).not.toHaveProperty('unavailableSetBy')
  })

  it('marcar e editar juntos geram os dois registros de auditoria', async () => {
    await updateBook(
      'book1',
      edit({ unavailableForNewRequests: true, shelf: 'Estante 005.2' }),
      LIBRARIAN,
    )

    expect(
      h.db
        .all('auditLog')
        .map((entry) => entry.action)
        .sort(),
    ).toEqual(['book_set_unavailable', 'book_update'])
  })

  it('apaga um campo opcional com null', async () => {
    const response = await updateBook(
      'book1',
      edit({ subtitle: null, coverUrl: null }),
      LIBRARIAN,
    )

    expect(response.subtitle).toBeNull()
    expect(h.db.read('books', 'book1')).not.toHaveProperty('subtitle')
  })

  it('google_books vira mixed quando um campo de origem Google muda', async () => {
    seedBook('book3', { dataSource: 'google_books' })

    const response = await updateBook(
      'book3',
      edit({ publisher: 'Outra' }),
      LIBRARIAN,
    )

    expect(response.dataSource).toBe('mixed')
  })

  it('sem nenhuma mudança não grava, não audita e não invalida o cache', async () => {
    const before = h.db.read('books', 'book1')

    const invalidated = await cacheWasInvalidated(() =>
      updateBook('book1', edit({ title: 'Código Limpo' }), LIBRARIAN),
    )

    expect(invalidated).toBe(false)
    expect(h.db.read('books', 'book1')).toEqual(before)
    expect(h.db.all('auditLog')).toEqual([])
  })

  it('não mexe em pedidos, empréstimos nem filas existentes', async () => {
    h.db.put('loans', 'loan1', { bookId: 'book1', status: 'active' })
    h.db.put('queueEntries', 'q1', { bookId: 'book1', status: 'waiting' })

    await updateBook(
      'book1',
      edit({ unavailableForNewRequests: true }),
      LIBRARIAN,
    )

    expect(h.db.read('loans', 'loan1')).toEqual({
      bookId: 'book1',
      status: 'active',
    })
    expect(h.db.read('queueEntries', 'q1')).toEqual({
      bookId: 'book1',
      status: 'waiting',
    })
  })

  it('invalida o cache da busca', async () => {
    expect(
      await cacheWasInvalidated(() =>
        updateBook('book1', edit({ shelf: 'Nova' }), LIBRARIAN),
      ),
    ).toBe(true)
  })

  it('responde 404 para livro inexistente ou removido', async () => {
    seedBook('removido', { status: 'removed' })

    for (const id of ['nao-existe', 'removido']) {
      const error = await catchError(
        updateBook(id, edit({ shelf: 'x' }), LIBRARIAN),
      )
      expect(error).toMatchObject({ status: 404, code: 'book_not_found' })
    }
  })
})

describe('remoção de livro (removeBook)', () => {
  beforeEach(() => {
    h.db.put('works', 'codigo-limpo--martin', {
      title: 'Código Limpo',
      authors: ['Robert C. Martin'],
      bookIds: ['book1'],
      editionCount: 1,
    })
  })

  it('remove o livro sem exemplar em circulação e sem fila', async () => {
    seedBook('book1', { queueLength: 0, copiesTotal: 2, copiesAvailable: 2 }, [
      'available',
      'available',
    ])

    await removeBook('book1', LIBRARIAN)

    expect(h.db.read('books', 'book1')).toMatchObject({
      status: 'removed',
      removedAt: START,
      removedBy: 'uid_ana',
      copiesTotal: 0,
      copiesAvailable: 0,
    })
    expect(h.db.read('copies', 'copy_book1_0')).toMatchObject({
      status: 'withdrawn',
    })
    expect(h.db.read('copies', 'copy_book1_1')).toMatchObject({
      status: 'withdrawn',
    })
    expect(h.db.read('works', 'codigo-limpo--martin')).toMatchObject({
      editionCount: 0,
      bookIds: ['book1'],
    })
    expect(h.db.all('auditLog')).toEqual([
      expect.objectContaining({
        action: 'book_remove',
        actorUid: 'uid_ana',
        bookId: 'book1',
      }),
    ])
  })

  it('não toca no histórico de empréstimos', async () => {
    seedBook('book1', { queueLength: 0 }, ['available'])
    const loan = { bookId: 'book1', status: 'returned', studentUid: 'uid_x' }
    h.db.put('loans', 'loan_antigo', loan)

    await removeBook('book1', LIBRARIAN)

    expect(h.db.read('loans', 'loan_antigo')).toEqual(loan)
  })

  it.each([
    ['um exemplar reservado', { queueLength: 0 }, ['available', 'reserved']],
    ['um exemplar emprestado', { queueLength: 0 }, ['on_loan']],
    ['fila de espera', { queueLength: 1 }, ['available']],
  ] as const)(
    'responde 409 com a sugestão de marcar como indisponível com %s',
    async (_label, book, statuses) => {
      seedBook('book1', book, [...statuses])
      const before = h.db.read('books', 'book1')

      const error = await catchError(removeBook('book1', LIBRARIAN))

      expect(error).toMatchObject({
        status: 409,
        code: 'book_in_circulation',
        extra: { suggestion: 'mark_unavailable' },
      })
      expect(h.db.read('books', 'book1')).toEqual(before)
      expect(h.db.read('works', 'codigo-limpo--martin')).toMatchObject({
        editionCount: 1,
      })
      expect(h.db.all('auditLog')).toEqual([])
    },
  )

  it('invalida o cache da busca', async () => {
    seedBook('book1', { queueLength: 0 }, ['available'])

    expect(
      await cacheWasInvalidated(() => removeBook('book1', LIBRARIAN)),
    ).toBe(true)
  })

  it('responde 404 para livro inexistente ou já removido', async () => {
    seedBook('book1', { status: 'removed' }, [])

    for (const id of ['nao-existe', 'book1']) {
      expect(await catchError(removeBook(id, LIBRARIAN))).toMatchObject({
        status: 404,
        code: 'book_not_found',
      })
    }
  })
})
