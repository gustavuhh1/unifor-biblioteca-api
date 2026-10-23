import { describe, expect, it } from 'vitest'
import { paginate, searchBooks } from '../rules/catalog-search.rules.js'
import { makeBook } from './book.fixtures.js'

const codigoLimpo = makeBook()
const arquitetura = makeBook({
  id: 'book_arquitetura',
  title: 'Arquitetura Limpa',
  subtitle: undefined,
  isbn: undefined,
  subjects: ['Programação'],
  unavailableForNewRequests: true,
})
const codificador = makeBook({
  id: 'book_codificador',
  title: 'O Codificador Limpo',
  subtitle: undefined,
  isbn: undefined,
  subjects: ['Programação'],
})
const calculo = makeBook({
  id: 'book_calculo',
  title: 'Cálculo, Vol. 1',
  subtitle: undefined,
  isbn: undefined,
  authors: ['James Stewart'],
  subjects: ['Matemática'],
})
const acervo = [codigoLimpo, arquitetura, codificador, calculo]

const titles = (books: { title: string }[]) => books.map((b) => b.title)

describe('busca no acervo (searchBooks)', () => {
  it('acha "Código Limpo" digitando "codigo", sem acento', () => {
    expect(titles(searchBooks(acervo, { q: 'codigo' }))).toEqual([
      'Código Limpo',
    ])
  })

  it('ignora maiúsculas e acentos do termo digitado', () => {
    expect(titles(searchBooks(acervo, { q: 'CÓDIGO' }))).toEqual([
      'Código Limpo',
    ])
    expect(titles(searchBooks(acervo, { q: 'calculo' }))).toEqual([
      'Cálculo, Vol. 1',
    ])
  })

  it('exige todos os termos (AND), em qualquer ordem', () => {
    expect(titles(searchBooks(acervo, { q: 'limpo martin' }))).toEqual([
      'Código Limpo',
      'O Codificador Limpo',
    ])
    expect(titles(searchBooks(acervo, { q: 'martin codigo' }))).toEqual([
      'Código Limpo',
    ])
    expect(searchBooks(acervo, { q: 'codigo stewart' })).toEqual([])
  })

  it('busca por autor, assunto e ISBN', () => {
    expect(titles(searchBooks(acervo, { q: 'stewart' }))).toEqual([
      'Cálculo, Vol. 1',
    ])
    expect(titles(searchBooks(acervo, { q: 'matematica' }))).toEqual([
      'Cálculo, Vol. 1',
    ])
    expect(titles(searchBooks(acervo, { q: '9788576082675' }))).toEqual([
      'Código Limpo',
    ])
  })

  it('lista todos com a busca vazia ou só com espaços', () => {
    expect(searchBooks(acervo, { q: '' })).toHaveLength(4)
    expect(searchBooks(acervo, { q: '   ' })).toHaveLength(4)
  })

  it('ordena por título em português do Brasil', () => {
    expect(titles(searchBooks(acervo, { q: '' }))).toEqual([
      'Arquitetura Limpa',
      'Cálculo, Vol. 1',
      'Código Limpo',
      'O Codificador Limpo',
    ])
  })

  it('nunca mostra o livro removido', () => {
    const removed = makeBook({ id: 'book_removido', status: 'removed' })

    expect(searchBooks([...acervo, removed], { q: 'codigo' })).toHaveLength(1)
    expect(searchBooks([removed], { q: '' })).toEqual([])
  })

  it('mostra o livro indisponível para novos pedidos', () => {
    expect(titles(searchBooks(acervo, { q: 'arquitetura' }))).toEqual([
      'Arquitetura Limpa',
    ])
  })
})

describe('filtros da lista do bibliotecário (searchBooks)', () => {
  it('"no_isbn" fica só com os livros sem ISBN', () => {
    expect(titles(searchBooks(acervo, { q: '', filter: 'no_isbn' }))).toEqual([
      'Arquitetura Limpa',
      'Cálculo, Vol. 1',
      'O Codificador Limpo',
    ])
  })

  it('"unavailable" fica só com os marcados como indisponíveis', () => {
    expect(
      titles(searchBooks(acervo, { q: '', filter: 'unavailable' })),
    ).toEqual(['Arquitetura Limpa'])
  })

  it('"all" não filtra, e o filtro combina com a busca', () => {
    expect(searchBooks(acervo, { q: '', filter: 'all' })).toHaveLength(4)
    expect(
      titles(searchBooks(acervo, { q: 'limpo', filter: 'no_isbn' })),
    ).toEqual(['O Codificador Limpo'])
  })
})

describe('paginação (paginate)', () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1)

  it('devolve a primeira página e o total de páginas', () => {
    const page = paginate(items, 1, 20)

    expect(page.items).toHaveLength(20)
    expect(page.items[0]).toBe(1)
    expect(page).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    })
  })

  it('devolve o resto na última página', () => {
    expect(paginate(items, 3, 20).items).toEqual([41, 42, 43, 44, 45])
  })

  it('devolve a lista vazia para página além do fim', () => {
    expect(paginate(items, 4, 20)).toMatchObject({ items: [], total: 45 })
  })

  it('não tem páginas quando não há itens', () => {
    expect(paginate([], 1, 20)).toMatchObject({ items: [], totalPages: 0 })
  })
})
