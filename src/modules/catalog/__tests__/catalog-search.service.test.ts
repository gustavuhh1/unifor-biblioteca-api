import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { searchCatalog, searchLibrarianCatalog } =
  await import('../services/catalog-search.service.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { makeBook } = await import('./book.fixtures.js')

function seedBook(id: string, overrides: Parameters<typeof makeBook>[0] = {}) {
  const book = makeBook({ id, ...overrides })
  const data: Record<string, unknown> = { ...book }
  delete data.id
  h.db.put('books', id, data)
}

const defaults = { q: '', page: 1, pageSize: 20 }

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  seedBook('b_codigo')
  seedBook('b_arquitetura', {
    title: 'Arquitetura Limpa',
    subtitle: undefined,
    isbn: undefined,
    unavailableForNewRequests: true,
  })
  seedBook('b_removido', { title: 'Código Antigo', status: 'removed' })
})

describe('busca do aluno (searchCatalog)', () => {
  it('acha "Código Limpo" digitando "codigo" e nunca o livro removido', async () => {
    const page = await searchCatalog({ ...defaults, q: 'codigo' })

    expect(page.items.map((item) => item.title)).toEqual(['Código Limpo'])
    expect(page.total).toBe(1)
  })

  it('devolve o resumo do card, sem os campos internos', async () => {
    const page = await searchCatalog(defaults)

    expect(page.items[1]).toEqual({
      id: 'b_codigo',
      title: 'Código Limpo',
      authors: ['Robert C. Martin'],
      coverUrl: null,
      coverTone: 1,
      copiesTotal: 3,
      copiesAvailable: 0,
      queueLength: 1,
      nextReturnAt: null,
      unavailableForNewRequests: false,
    })
  })

  it('mostra o livro indisponível para novos pedidos', async () => {
    const page = await searchCatalog({ ...defaults, q: 'arquitetura' })

    expect(page.items).toEqual([
      expect.objectContaining({
        title: 'Arquitetura Limpa',
        unavailableForNewRequests: true,
      }),
    ])
  })

  it('pagina o resultado', async () => {
    const page = await searchCatalog({ q: '', page: 2, pageSize: 1 })

    expect(page).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    })
    expect(page.items.map((item) => item.title)).toEqual(['Código Limpo'])
  })

  it('lê o Firestore uma vez só: a segunda busca usa o cache', async () => {
    const collection = vi.spyOn(h.db, 'collection')

    await searchCatalog({ ...defaults, q: 'codigo' })
    await searchCatalog({ ...defaults, q: 'arquitetura' })

    expect(collection).toHaveBeenCalledTimes(1)
    expect(collection).toHaveBeenCalledWith('books')
  })

  it('recarrega o acervo depois de o cache ser invalidado', async () => {
    await searchCatalog(defaults)
    seedBook('b_novo', { title: 'Refatoração', isbn: undefined })

    expect((await searchCatalog(defaults)).total).toBe(2)

    invalidateCatalogCache()
    expect((await searchCatalog(defaults)).total).toBe(3)
  })
})

describe('lista do bibliotecário (searchLibrarianCatalog)', () => {
  const librarian = { ...defaults, filter: 'all' as const }

  it('devolve o registro completo, sem o texto de busca', async () => {
    const page = await searchLibrarianCatalog({ ...librarian, q: 'codigo' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      id: 'b_codigo',
      isbn: '9788576082675',
      cdu: '005.1',
      cutter: 'M386c',
      shelf: 'Estante 005.1',
      status: 'active',
      dataSource: 'mixed',
      googleBooks: {
        volumeId: 'vol123',
        found: true,
      },
    })
    expect(page.items[0]).not.toHaveProperty('searchText')
  })

  it('filtra os livros sem ISBN', async () => {
    const page = await searchLibrarianCatalog({
      ...librarian,
      filter: 'no_isbn',
    })

    expect(page.items.map((item) => item.id)).toEqual(['b_arquitetura'])
  })

  it('filtra os livros indisponíveis para novos pedidos', async () => {
    const page = await searchLibrarianCatalog({
      ...librarian,
      filter: 'unavailable',
    })

    expect(page.items.map((item) => item.id)).toEqual(['b_arquitetura'])
  })

  it('só lista livros ativos', async () => {
    const page = await searchLibrarianCatalog(librarian)

    expect(page.items.map((item) => item.id)).not.toContain('b_removido')
  })
})
