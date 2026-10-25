import { describe, expect, it } from 'vitest'
import { makeBook } from '../../catalog/__tests__/book.fixtures.js'
import {
  toFolderResponse,
  toSavedBookResponse,
  toSavedBookResponses,
} from '../rules/saved-view.rules.js'
import { AT } from './saved.fixtures.js'

const saved = (bookId: string, savedAt: Date, folderIds: string[] = []) => ({
  id: bookId,
  bookId,
  savedAt,
  folderIds,
  createdAt: AT,
  updatedAt: AT,
})

describe('livro salvo na resposta (toSavedBookResponse, RF-SAL-01)', () => {
  it('traz o card do acervo, quando foi salvo e as pastas', () => {
    const book = makeBook({ id: 'b1', copiesAvailable: 2 })

    const response = toSavedBookResponse(book, saved('b1', AT, ['f1']))

    expect(response).toMatchObject({
      id: 'b1',
      title: book.title,
      copiesAvailable: 2,
      savedAt: '2026-10-21T15:00:00.000Z',
      folderIds: ['f1'],
    })
  })
})

describe('lista de salvos (toSavedBookResponses)', () => {
  it('mantém a ordem dos salvos e deixa de fora o livro que saiu do acervo', () => {
    const books = [makeBook({ id: 'b1' }), makeBook({ id: 'b3' })]
    const list = [saved('b3', AT), saved('b2', AT), saved('b1', AT)]

    expect(toSavedBookResponses(list, books).map((item) => item.id)).toEqual([
      'b3',
      'b1',
    ])
  })
})

describe('pasta na resposta (toFolderResponse, RF-SAL-02)', () => {
  it('mostra só o id, o nome e a contagem de livros', () => {
    expect(
      toFolderResponse({
        id: 'f1',
        name: 'TCC',
        bookCount: 2,
        createdAt: AT,
        updatedAt: AT,
      }),
    ).toEqual({ id: 'f1', name: 'TCC', bookCount: 2 })
  })
})
