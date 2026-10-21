import { describe, expect, it } from 'vitest'
import {
  createBookBodySchema,
  isbnSchema,
  librarianListBooksQuerySchema,
  listBooksQuerySchema,
  updateBookBodySchema,
} from '../schemas/request.schemas.js'

const validCreate = {
  title: 'Código Limpo',
  authors: ['Robert C. Martin'],
  cdu: '005.1',
  cutter: 'M386c',
  shelf: 'Estante 005.1',
  copies: [
    { registration: '46122', libraryCode: '1163 · Biblioteca · Livros' },
  ],
}

const messages = (result: {
  success: boolean
  error?: { issues: { message: string }[] }
}) => result.error?.issues.map((issue) => issue.message) ?? []

describe('ISBN (isbnSchema)', () => {
  it('tira hífens e espaços e aceita 10 ou 13 dígitos', () => {
    expect(isbnSchema.parse('978-85-7608-267-5')).toBe('9788576082675')
    expect(isbnSchema.parse(' 85 7608 267 0 ')).toBe('8576082670')
  })

  it('recusa tamanho diferente de 10 ou 13 e letras', () => {
    for (const isbn of [
      '123',
      '97885760826',
      '97885760826751',
      '978857608267X',
    ]) {
      expect(isbnSchema.safeParse(isbn).success).toBe(false)
    }
    expect(messages(isbnSchema.safeParse('123'))).toEqual([
      'O ISBN deve ter 10 ou 13 dígitos.',
    ])
  })
})

describe('busca (listBooksQuerySchema)', () => {
  it('usa o padrão: busca vazia, página 1, 20 por página', () => {
    expect(listBooksQuerySchema.parse({})).toEqual({
      q: '',
      page: 1,
      pageSize: 20,
    })
  })

  it('converte página e tamanho que chegam como texto', () => {
    expect(
      listBooksQuerySchema.parse({ q: ' codigo ', page: '2', pageSize: '50' }),
    ).toEqual({ q: 'codigo', page: 2, pageSize: 50 })
  })

  it('recusa página 0 e mais de 50 itens por página', () => {
    expect(listBooksQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(listBooksQuerySchema.safeParse({ pageSize: '51' }).success).toBe(
      false,
    )
    expect(listBooksQuerySchema.safeParse({ pageSize: '0' }).success).toBe(
      false,
    )
  })
})

describe('lista do bibliotecário (librarianListBooksQuerySchema)', () => {
  it('o filtro padrão é "all"', () => {
    expect(librarianListBooksQuerySchema.parse({}).filter).toBe('all')
  })

  it('aceita os três filtros e recusa outro', () => {
    for (const filter of ['all', 'no_isbn', 'unavailable']) {
      expect(librarianListBooksQuerySchema.parse({ filter }).filter).toBe(
        filter,
      )
    }
    expect(
      librarianListBooksQuerySchema.safeParse({ filter: 'x' }).success,
    ).toBe(false)
  })
})

describe('cadastro do livro (createBookBodySchema)', () => {
  it('aceita o mínimo e completa os padrões', () => {
    const body = createBookBodySchema.parse(validCreate)

    expect(body).toMatchObject({
      language: 'Português',
      materialType: 'Livro',
      location: 'Biblioteca (Praça Central)',
      translators: [],
      subjects: [],
    })
    expect(body.copies[0]).toMatchObject({ format: 'Impresso' })
  })

  it('exige CDU, Cutter e estante', () => {
    for (const field of ['cdu', 'cutter', 'shelf']) {
      const rest: Record<string, unknown> = { ...validCreate }
      delete rest[field]
      expect(createBookBodySchema.safeParse(rest).success).toBe(false)
    }
  })

  it('exige ao menos um autor e ao menos um exemplar', () => {
    expect(
      createBookBodySchema.safeParse({ ...validCreate, authors: [] }).success,
    ).toBe(false)
    expect(
      createBookBodySchema.safeParse({ ...validCreate, copies: [] }).success,
    ).toBe(false)
  })

  it('exige o registro e o código da biblioteca de cada exemplar', () => {
    expect(
      createBookBodySchema.safeParse({
        ...validCreate,
        copies: [{ libraryCode: 'x' }],
      }).success,
    ).toBe(false)
    expect(
      createBookBodySchema.safeParse({
        ...validCreate,
        copies: [{ registration: '1' }],
      }).success,
    ).toBe(false)
  })

  it('normaliza o ISBN e trata texto em branco como não informado', () => {
    const body = createBookBodySchema.parse({
      ...validCreate,
      isbn: '978-85-7608-267-5',
      subtitle: '   ',
      publisher: '',
    })

    expect(body.isbn).toBe('9788576082675')
    expect(body.subtitle).toBeUndefined()
    expect(body.publisher).toBeUndefined()
  })

  it('recusa ISBN inválido e capa fora de https', () => {
    expect(
      createBookBodySchema.safeParse({ ...validCreate, isbn: '12345' }).success,
    ).toBe(false)
    expect(
      createBookBodySchema.safeParse({
        ...validCreate,
        coverUrl: 'http://x.com/c.jpg',
      }).success,
    ).toBe(false)
  })

  it('só aceita volumeId junto com o ISBN', () => {
    const result = createBookBodySchema.safeParse({
      ...validCreate,
      volumeId: 'vol1',
    })

    expect(result.success).toBe(false)
    expect(
      createBookBodySchema.safeParse({
        ...validCreate,
        isbn: '9788576082675',
        volumeId: 'vol1',
      }).success,
    ).toBe(true)
  })
})

describe('edição do livro (updateBookBodySchema)', () => {
  it('aceita só os campos enviados', () => {
    expect(updateBookBodySchema.parse({ shelf: 'Estante 005.2' })).toEqual({
      shelf: 'Estante 005.2',
    })
  })

  it('recusa o corpo sem nenhum campo', () => {
    const result = updateBookBodySchema.safeParse({})

    expect(result.success).toBe(false)
    expect(messages(result)).toEqual([
      'Informe ao menos um campo para alterar.',
    ])
  })

  it('recusa os campos que não são editáveis aqui', () => {
    for (const field of [
      'workId',
      'copiesTotal',
      'copiesAvailable',
      'queueLength',
      'status',
      'copies',
      'searchText',
      'dataSource',
    ]) {
      const result = updateBookBodySchema.safeParse({
        title: 'Novo',
        [field]: field === 'copies' ? [] : 1,
      })
      expect(result.success, field).toBe(false)
    }
  })

  it('diz quais campos não podem ser editados', () => {
    expect(
      messages(
        updateBookBodySchema.safeParse({
          title: 'Novo',
          workId: 'x',
          status: 'removed',
        }),
      ),
    ).toEqual(['Campos que não podem ser editados: workId, status.'])
  })

  it('texto em branco ou null apagam um campo opcional', () => {
    expect(
      updateBookBodySchema.parse({ subtitle: '  ', series: null, isbn: '' }),
    ).toEqual({ subtitle: null, series: null, isbn: null })
  })

  it('não deixa apagar um campo obrigatório', () => {
    expect(updateBookBodySchema.safeParse({ title: null }).success).toBe(false)
    expect(updateBookBodySchema.safeParse({ cdu: '' }).success).toBe(false)
    expect(updateBookBodySchema.safeParse({ authors: [] }).success).toBe(false)
  })

  it('confere a cor da capa (1 a 6) e o ISBN', () => {
    expect(updateBookBodySchema.safeParse({ coverTone: 7 }).success).toBe(false)
    expect(updateBookBodySchema.safeParse({ coverTone: 0 }).success).toBe(false)
    expect(updateBookBodySchema.parse({ coverTone: 6 })).toEqual({
      coverTone: 6,
    })
    expect(updateBookBodySchema.safeParse({ isbn: '123' }).success).toBe(false)
  })

  it('aceita marcar e desmarcar o livro como indisponível', () => {
    expect(
      updateBookBodySchema.parse({ unavailableForNewRequests: true }),
    ).toEqual({ unavailableForNewRequests: true })
    expect(
      updateBookBodySchema.safeParse({ unavailableForNewRequests: 'sim' })
        .success,
    ).toBe(false)
  })
})
