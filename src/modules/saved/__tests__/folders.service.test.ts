import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeFirestore } from '../../../test-support/fake-firestore.js'

const h = vi.hoisted(() => ({ db: undefined as unknown as FakeFirestore }))

vi.mock('../../../config/firebase.js', () => ({ getDb: () => h.db }))

const { FakeFirestore: Fake } =
  await import('../../../test-support/fake-firestore.js')
const { catchError } = await import('../../../test-support/catch-error.js')
const { createFolder, deleteFolder, listFolders, renameFolder } =
  await import('../services/folders.service.js')
const { STUDENT, putFolder, putSaved } = await import('./saved.fixtures.js')

const SAVED_PATH = `users/${STUDENT}/savedBooks`
const FOLDERS_PATH = `users/${STUDENT}/folders`

beforeEach(() => {
  h.db = new Fake()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
})

describe('listFolders (RF-SAL-02)', () => {
  it('lista da pasta mais antiga para a mais nova e conta Todos os salvos', async () => {
    putFolder(h.db, 'f2', {
      name: 'TCC',
      createdAt: new Date('2026-10-21T10:00:00Z'),
    })
    putFolder(h.db, 'f1', {
      name: 'Ler depois',
      createdAt: new Date('2026-10-20T10:00:00Z'),
    })
    putSaved(h.db, 'b1')
    putSaved(h.db, 'b2')

    const response = await listFolders(STUDENT)

    expect(response.savedCount).toBe(2)
    expect(response.items.map((folder) => folder.name)).toEqual([
      'Ler depois',
      'TCC',
    ])
  })

  it('aluno sem pastas e sem salvos recebe a lista vazia', async () => {
    expect(await listFolders(STUDENT)).toEqual({ savedCount: 0, items: [] })
  })
})

describe('createFolder (RF-SAL-02)', () => {
  it('cria a pasta vazia', async () => {
    const folder = await createFolder(STUDENT, 'Amei!!!')

    expect(folder).toMatchObject({ name: 'Amei!!!', bookCount: 0 })
    expect(h.db.read(FOLDERS_PATH, folder.id)).toMatchObject({
      name: 'Amei!!!',
      bookCount: 0,
    })
  })
})

describe('renameFolder (RF-SAL-02)', () => {
  it('troca o nome e mantém a contagem', async () => {
    putFolder(h.db, 'f1', { name: 'Ler depois', bookCount: 3 })

    const folder = await renameFolder(STUDENT, 'f1', 'Para ler')

    expect(folder).toEqual({ id: 'f1', name: 'Para ler', bookCount: 3 })
    expect(h.db.read(FOLDERS_PATH, 'f1')?.name).toBe('Para ler')
  })

  it('pasta que não existe é 404 (folder_not_found)', async () => {
    const error = await catchError(renameFolder(STUDENT, 'x', 'Novo'))

    expect(error.status).toBe(404)
    expect(error.code).toBe('folder_not_found')
  })

  it('não renomeia a pasta de outro aluno', async () => {
    putFolder(h.db, 'f1', {}, 'uid_marina')

    expect((await catchError(renameFolder(STUDENT, 'f1', 'Meu'))).status).toBe(
      404,
    )
  })
})

describe('deleteFolder (RF-SAL-02)', () => {
  it('apaga a pasta e tira só ela dos livros, que continuam salvos', async () => {
    putFolder(h.db, 'f1', { bookCount: 2 })
    putFolder(h.db, 'f2', { bookCount: 1 })
    putSaved(h.db, 'b1', { folderIds: ['f1', 'f2'] })
    putSaved(h.db, 'b2', { folderIds: ['f1'] })
    putSaved(h.db, 'b3', { folderIds: ['f2'] })

    await deleteFolder(STUDENT, 'f1')

    expect(h.db.read(FOLDERS_PATH, 'f1')).toBeUndefined()
    expect(h.db.read(FOLDERS_PATH, 'f2')).toBeDefined()
    expect(h.db.read(SAVED_PATH, 'b1')?.folderIds).toEqual(['f2'])
    expect(h.db.read(SAVED_PATH, 'b2')?.folderIds).toEqual([])
    expect(h.db.read(SAVED_PATH, 'b3')?.folderIds).toEqual(['f2'])
  })

  it('pasta que não existe é 404 (folder_not_found)', async () => {
    expect((await catchError(deleteFolder(STUDENT, 'x'))).code).toBe(
      'folder_not_found',
    )
  })
})
