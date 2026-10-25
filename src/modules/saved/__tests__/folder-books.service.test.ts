import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { addBookToFolder, removeBookFromFolder } =
  await import('../services/folder-books.service.js')
const { STUDENT, putBook, putFolder, putSaved } =
  await import('./saved.fixtures.js')

const SAVED_PATH = `users/${STUDENT}/savedBooks`
const FOLDERS_PATH = `users/${STUDENT}/folders`

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
})

describe('addBookToFolder (RF-SAL-03)', () => {
  it('põe o livro salvo na pasta e sobe a contagem', async () => {
    putBook(h.db, 'b1')
    putFolder(h.db, 'f1', { bookCount: 1 })
    putSaved(h.db, 'b1')

    const saved = await addBookToFolder(STUDENT, 'f1', 'b1')

    expect(saved.folderIds).toEqual(['f1'])
    expect(h.db.read(SAVED_PATH, 'b1')?.folderIds).toEqual(['f1'])
    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(2)
  })

  it('o livro pode estar em várias pastas', async () => {
    putBook(h.db, 'b1')
    putFolder(h.db, 'f1')
    putFolder(h.db, 'f2')
    putSaved(h.db, 'b1', { folderIds: ['f1'] })

    const saved = await addBookToFolder(STUDENT, 'f2', 'b1')

    expect(saved.folderIds).toEqual(['f1', 'f2'])
  })

  it('colocar de novo na mesma pasta não muda a contagem', async () => {
    putBook(h.db, 'b1')
    putFolder(h.db, 'f1', { bookCount: 1 })
    putSaved(h.db, 'b1', { folderIds: ['f1'] })

    await addBookToFolder(STUDENT, 'f1', 'b1')

    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(1)
  })

  it('livro que não está salvo é 409 (book_not_saved) e nada muda', async () => {
    putBook(h.db, 'b1')
    putFolder(h.db, 'f1')

    const error = await catchError(addBookToFolder(STUDENT, 'f1', 'b1'))

    expect(error.status).toBe(409)
    expect(error.code).toBe('book_not_saved')
    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(0)
  })

  it('pasta que não existe é 404 (folder_not_found)', async () => {
    putBook(h.db, 'b1')
    putSaved(h.db, 'b1')

    const error = await catchError(addBookToFolder(STUDENT, 'x', 'b1'))

    expect(error.code).toBe('folder_not_found')
  })

  it('livro removido do acervo é 404 (book_not_found)', async () => {
    putBook(h.db, 'b1', { status: 'removed' })
    putFolder(h.db, 'f1')
    putSaved(h.db, 'b1')

    const error = await catchError(addBookToFolder(STUDENT, 'f1', 'b1'))

    expect(error.code).toBe('book_not_found')
  })
})

describe('removeBookFromFolder (RF-SAL-03)', () => {
  it('tira o livro da pasta, baixa a contagem e o livro continua salvo', async () => {
    putFolder(h.db, 'f1', { bookCount: 2 })
    putSaved(h.db, 'b1', { folderIds: ['f1'] })

    await removeBookFromFolder(STUDENT, 'f1', 'b1')

    expect(h.db.read(SAVED_PATH, 'b1')?.folderIds).toEqual([])
    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(1)
  })

  it('livro que não estava na pasta: nada muda', async () => {
    putFolder(h.db, 'f1', { bookCount: 2 })
    putSaved(h.db, 'b1')

    await removeBookFromFolder(STUDENT, 'f1', 'b1')

    expect(h.db.read(FOLDERS_PATH, 'f1')?.bookCount).toBe(2)
  })

  it('pasta que não existe é 404 (folder_not_found)', async () => {
    const error = await catchError(removeBookFromFolder(STUDENT, 'x', 'b1'))

    expect(error.code).toBe('folder_not_found')
  })
})
