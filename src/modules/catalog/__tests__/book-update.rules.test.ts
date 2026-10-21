import { describe, expect, it } from 'vitest'
import {
  applyBookUpdate,
  applyToBook,
  DELETE_FIELD,
} from '../rules/book-update.rules.js'
import { AT, makeBook } from './book.fixtures.js'

const LATER = new Date('2026-10-22T10:00:00Z')
const LIBRARIAN = 'uid_ana'

describe('edição do livro (applyBookUpdate)', () => {
  it('grava só o que mudou e lista os campos alterados', () => {
    const book = makeBook({ dataSource: 'manual' })

    const result = applyBookUpdate(
      book,
      { title: 'Código Limpo (2ª ed.)', cdu: '005.1', shelf: 'Estante 005.2' },
      LIBRARIAN,
      LATER,
    )

    expect(result.changedFields).toEqual(['title', 'shelf'])
    expect(result.update).toMatchObject({
      title: 'Código Limpo (2ª ed.)',
      shelf: 'Estante 005.2',
      updatedAt: LATER,
    })
    expect(result.update).not.toHaveProperty('cdu')
    expect(result.unavailableChanged).toBe(false)
  })

  it('não grava nada quando nada mudou', () => {
    const result = applyBookUpdate(
      makeBook(),
      { title: 'Código Limpo', unavailableForNewRequests: false },
      LIBRARIAN,
      LATER,
    )

    expect(result).toEqual({
      update: {},
      changedFields: [],
      unavailableChanged: false,
    })
  })

  it('refaz o texto de busca quando título, autores, assuntos ou ISBN mudam', () => {
    const book = makeBook()

    const result = applyBookUpdate(
      book,
      { title: 'Clean Code', isbn: '9780132350884' },
      LIBRARIAN,
      LATER,
    )

    expect(result.update.searchText).toBe(
      'clean code habilidades praticas do agile software robert c. martin desenvolvimento de software linguagem de programacao 9780132350884',
    )
  })

  it('não mexe no texto de busca quando só muda um campo fora dele', () => {
    const result = applyBookUpdate(
      makeBook(),
      { shelf: 'Estante nova' },
      LIBRARIAN,
      LATER,
    )

    expect(result.update).not.toHaveProperty('searchText')
  })

  it('null apaga um campo opcional; a capa vira null em vez de sumir', () => {
    const book = makeBook({ coverUrl: 'https://x.com/c.jpg' })

    const result = applyBookUpdate(
      book,
      { subtitle: null, coverUrl: null, series: null },
      LIBRARIAN,
      LATER,
    )

    expect(result.update.subtitle).toBe(DELETE_FIELD)
    expect(result.update.series).toBe(DELETE_FIELD)
    expect(result.update.coverUrl).toBeNull()
    expect(result.changedFields).toEqual(['subtitle', 'coverUrl', 'series'])
  })

  it('apagar um campo que já não existe não conta como mudança', () => {
    const book = makeBook({ subtitle: undefined, coverUrl: null })

    const result = applyBookUpdate(
      book,
      { subtitle: null, coverUrl: null },
      LIBRARIAN,
      LATER,
    )

    expect(result.changedFields).toEqual([])
  })

  it('google_books vira mixed quando um campo de origem Google muda', () => {
    const result = applyBookUpdate(
      makeBook({ dataSource: 'google_books' }),
      { publisher: 'Outra Editora' },
      LIBRARIAN,
      LATER,
    )

    expect(result.update.dataSource).toBe('mixed')
  })

  it('manual continua manual', () => {
    const result = applyBookUpdate(
      makeBook({ dataSource: 'manual' }),
      { publisher: 'Outra Editora' },
      LIBRARIAN,
      LATER,
    )

    expect(result.update).not.toHaveProperty('dataSource')
  })

  describe('indisponível para novos pedidos', () => {
    it('ao marcar, grava quando e quem marcou', () => {
      const result = applyBookUpdate(
        makeBook(),
        { unavailableForNewRequests: true },
        LIBRARIAN,
        LATER,
      )

      expect(result.unavailableChanged).toBe(true)
      expect(result.changedFields).toEqual([])
      expect(result.update).toMatchObject({
        unavailableForNewRequests: true,
        unavailableSetAt: LATER,
        unavailableSetBy: LIBRARIAN,
        updatedAt: LATER,
      })
    })

    it('ao desmarcar, limpa quando e quem tinha marcado', () => {
      const book = makeBook({
        unavailableForNewRequests: true,
        unavailableSetAt: AT,
        unavailableSetBy: 'uid_outra',
      })

      const result = applyBookUpdate(
        book,
        { unavailableForNewRequests: false },
        LIBRARIAN,
        LATER,
      )

      expect(result.unavailableChanged).toBe(true)
      expect(result.update).toMatchObject({
        unavailableForNewRequests: false,
        unavailableSetAt: DELETE_FIELD,
        unavailableSetBy: DELETE_FIELD,
      })
    })

    it('marcar um livro que já está marcado não muda nada e mantém quem marcou', () => {
      const book = makeBook({
        unavailableForNewRequests: true,
        unavailableSetAt: AT,
        unavailableSetBy: 'uid_outra',
      })

      const result = applyBookUpdate(
        book,
        { unavailableForNewRequests: true },
        LIBRARIAN,
        LATER,
      )

      expect(result.update).toEqual({})
      expect(result.unavailableChanged).toBe(false)
    })

    it('marcar e editar juntos geram as duas mudanças', () => {
      const result = applyBookUpdate(
        makeBook(),
        { unavailableForNewRequests: true, shelf: 'Estante nova' },
        LIBRARIAN,
        LATER,
      )

      expect(result.unavailableChanged).toBe(true)
      expect(result.changedFields).toEqual(['shelf'])
    })
  })
})

describe('livro depois de gravar a edição (applyToBook)', () => {
  it('aplica os valores novos e remove os campos apagados', () => {
    const next = applyToBook(makeBook(), {
      title: 'Novo',
      subtitle: DELETE_FIELD,
    })

    expect(next.title).toBe('Novo')
    expect(next).not.toHaveProperty('subtitle')
  })
})
