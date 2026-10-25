import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { invalidateCatalogCache } =
  await import('../../../shared/catalog-cache.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { listSaved, saveBook, unsaveBook } =
  await import('../services/saved-books.service.js')
const { STUDENT, putBook, putFolder, putSaved } =
  await import('./saved.fixtures.js')

const SAVED_PATH = `users/${STUDENT}/savedBooks`
const FOLDERS_PATH = `users/${STUDENT}/folders`

beforeEach(() => {
  h.db = new Fake()
  invalidateCatalogCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
})

describe('listSaved: Todos os salvos e as pastas (RF-SAL-01, RF-SAL-03)', () => {
  it('lista os salvos há menos tempo primeiro, com a disponibilidade de agora', async () => {
    putBook(h.db, 'b1', { copiesAvailable: 2 })
    putBook(h.db, 'b2')
    putSaved(h.db, 'b1', { savedAt: new Date('2026-10-20T10:00:00Z') })
    putSaved(h.db, 'b2', { savedAt: new Date('2026-10-21T10:00:00Z') })

    const { items } = await listSaved(STUDENT)

    expect(items.map((item) => item.id)).toEqual(['b2', 'b1'])
    expect(items[1]?.copiesAvailable).toBe(2)
  })

  it('só lista os livros da pasta pedida', async () => {
    putBook(h.db, 'b1')
    putBook(h.db, 'b2')
    putFolder(h.db, 'f1')
    putSaved(h.db, 'b1', { folderIds: ['f1'] })
    putSaved(h.db, 'b2')

    const { items } = await listSaved(STUDENT, 'f1')

    expect(items.map((item) => item.id)).toEqual(['b1'])
  })

  it('não mostra o livro que foi removido do acervo', async () => {
    putBook(h.db, 'b1')
    putBook(h.db, 'b2', { status: 'removed' })
    putSaved(h.db, 'b1')
    putSaved(h.db, 'b2')

    const { items } = await listSaved(STUDENT)

    expect(items.map((item) => item.id)).toEqual(['b1'])
  })

  it('não mistura os salvos de outro aluno', async () => {
    putBook(h.db, 'b1')
    putSaved(h.db, 'b1', {}, 'uid_marina')

    expect((await listSaved(STUDENT)).items).toEqual([])
  })

  it('pasta que não existe é 404 (folder_not_found)', async () => {
    const error = await catchError(listSaved(STUDENT, 'nao-existe'))

    expect(error.status).toBe(404)
    expect(error.code).toBe('folder_not_found')
  })
})

describe('saveBook: salvar em Todos os salvos (RF-SAL-01)', () => {
  it('salva o livro sem pastas e devolve o card', async () => {
    putBook(h.db, 'b1')

    const saved = await saveBook(STUDENT, 'b1')

    expect(saved).toMatchObject({
      id: 'b1',
      folderIds: [],
      savedAt: '2026-10-22T12:00:00.000Z',
    })
    expect(h.db.read(SAVED_PATH, 'b1')).toMatchObject({
      bookId: 'b1',
      folderIds: [],
    })
  })

  it('salvar de novo mantém a data e as pastas', async () => {
    putBook(h.db, 'b1')
    putFolder(h.db, 'f1', { bookCount: 1 })
    putSaved(h.db, 'b1', {
      savedAt: new Date('2026-10-20T10:00:00Z'),
      folderIds: ['f1'],
    })

    const saved = await saveBook(STUDENT, 'b1')

    expect(saved.savedAt).toBe('2026-10-20T10:00:00.000Z')
    expect(saved.folderIds).toEqual(['f1'])
  })

  it('livro removido do acervo é 404 (book_not_found) e nada é salvo', async () => {
    putBook(h.db, 'b1', { status: 'removed' })

    const error = await catchError(saveBook(STUDENT, 'b1'))

    expect(error.code).toBe('book_not_found')
    expect(h.db.read(SAVED_PATH, 'b1')).toBeUndefined()
  })

  it('livro que não existe é 404 (book_not_found)', async () => {
    expect((await catchError(saveBook(STUDENT, 'x'))).status).toBe(404)
  })
})

describe('unsaveBook: tirar de Todos os salvos (RF-SAL-01)', () => {
  it('apaga o livro dos salvos e baixa a contagem das pastas em que estava', async () => {
    putFolder(h.db, 'f1', { bookCount: 2 })
    putFolder(h.db, 'f2', { bookCount: 1 })
    putFolder(h.db, 'f3', { bookCount: 5 })
    putSaved(h.db, 'b1', { folderIds: ['f1', 'f2'] })

    await unsaveBook(STUDENT, 'b1')

    expect(h.db.read(SAVED_PATH, 'b1')).toBeUndefined()
    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(1)
    expect(h.db.read(FOLDERS_PATH, 'f2')?.bookCount).toBe(0)
    expect(h.db.read(FOLDERS_PATH, 'f3')?.bookCount).toBe(5)
  })

  it('livro que não estava salvo: nada muda e não dá erro', async () => {
    putFolder(h.db, 'f1', { bookCount: 1 })

    await expect(unsaveBook(STUDENT, 'b1')).resolves.toBeUndefined()

    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(1)
  })
})
