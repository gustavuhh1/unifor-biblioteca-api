import { z } from 'zod'
import {
  DEFAULT_BOOK_LANGUAGE,
  DEFAULT_COPY_FORMAT,
  DEFAULT_MATERIAL_TYPE,
  LIBRARY_PLACE,
} from '../../../shared/library.js'
import {
  CATALOG_FILTER,
  CATALOG_FILTERS,
  COVER_TONE_COUNT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../catalog.constants.js'
import { ISBN_FORMAT, normalizeIsbn } from '../rules/isbn.rules.js'

// Schemas de entrada do módulo do acervo: query, parâmetros e corpo. As
// mensagens de erro são mostradas ao usuário, em português.

// --- Campos ------------------------------------------------------------------

// ISBN-10 ou ISBN-13: tira hífens e espaços e exige só dígitos (RF-GAC-02).
export const isbnSchema = z
  .string('Informe o ISBN.')
  .transform(normalizeIsbn)
  .pipe(z.string().regex(ISBN_FORMAT, 'O ISBN deve ter 10 ou 13 dígitos.'))
  .meta({ example: '9788576082675' })

// Texto em branco conta como "não informado".
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

// Texto em branco numa edição conta como "apagar o campo".
const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const text = (label: string, max: number) =>
  z
    .string(`Informe ${label}.`)
    .trim()
    .min(1, `Informe ${label}.`)
    .max(
      max,
      `${label[0]!.toUpperCase()}${label.slice(1)} deve ter até ${max} caracteres.`,
    )

// Campo de texto opcional no cadastro.
const optionalText = (label: string, max: number) =>
  z.preprocess(blankToUndefined, text(label, max).optional())

// Campo de texto opcional na edição: null (ou texto em branco) apaga o campo.
const clearableText = (label: string, max: number) =>
  z.preprocess(blankToNull, text(label, max).nullable().optional())

const authorsSchema = z
  .array(text('o nome do autor', 200), 'Informe os autores.')
  .min(1, 'Informe ao menos um autor.')
  .max(30, 'Informe até 30 autores.')

const peopleSchema = z
  .array(text('o nome', 200))
  .max(30, 'Informe até 30 nomes.')

const subjectsSchema = z
  .array(text('o assunto', 200))
  .max(50, 'Informe até 50 assuntos.')

const yearSchema = z
  .number('O ano deve ser um número.')
  .int('O ano deve ser um número inteiro.')
  .min(1000, 'Informe um ano com 4 dígitos.')
  .max(2100, 'Informe um ano até 2100.')

// Endereço da capa: só https.
const coverUrlSchema = z
  .url('Informe um endereço de capa válido.')
  .max(1000, 'O endereço da capa deve ter até 1000 caracteres.')
  .refine(
    (url) => url.startsWith('https://'),
    'O endereço da capa deve usar https.',
  )

const coverToneSchema = z
  .number('A cor da capa deve ser um número.')
  .int()
  .min(1, `A cor da capa vai de 1 a ${COVER_TONE_COUNT}.`)
  .max(COVER_TONE_COUNT, `A cor da capa vai de 1 a ${COVER_TONE_COUNT}.`)

// --- Parâmetros e query ------------------------------------------------------

// Parâmetro :bookId das rotas de livro.
export const bookParamsSchema = z.object({
  bookId: z.string().min(1).max(200),
})

// Parâmetro :isbn de GET /librarian/google-books/:isbn.
export const isbnParamsSchema = z.object({ isbn: isbnSchema })

// Texto buscado e página: o que a busca do aluno e a do bibliotecário têm em comum.
const searchQueryFields = {
  q: z
    .string()
    .trim()
    .max(100, 'A busca deve ter até 100 caracteres.')
    .default('')
    .meta({
      description: 'Termos separados por espaço; todos precisam aparecer.',
    }),
  page: z.coerce
    .number('A página deve ser um número.')
    .int('A página deve ser um número inteiro.')
    .min(1, 'A primeira página é a 1.')
    .default(1),
  pageSize: z.coerce
    .number('O tamanho da página deve ser um número.')
    .int('O tamanho da página deve ser um número inteiro.')
    .min(1, 'A página tem pelo menos 1 item.')
    .max(MAX_PAGE_SIZE, `A página tem no máximo ${MAX_PAGE_SIZE} itens.`)
    .default(DEFAULT_PAGE_SIZE),
}

// Query de GET /books: busca do aluno (RF-ACE-01).
export const listBooksQuerySchema = z
  .object(searchQueryFields)
  .meta({ id: 'ListBooksQuery' })

// Query de GET /librarian/books: a mesma busca, com o filtro (RF-GAC-01).
export const librarianListBooksQuerySchema = z
  .object({
    ...searchQueryFields,
    filter: z
      .enum(
        CATALOG_FILTERS,
        'Filtro inválido: use all, no_isbn ou unavailable.',
      )
      .default(CATALOG_FILTER.all),
  })
  .meta({ id: 'LibrarianListBooksQuery' })

// --- Corpos ------------------------------------------------------------------

// Um exemplar no cadastro do livro (RF-GAC-02).
export const copyInputSchema = z
  .object({
    registration: text('o registro do exemplar', 30).meta({ example: '46122' }),
    format: z
      .preprocess(blankToUndefined, text('o formato', 40).optional())
      .default(DEFAULT_COPY_FORMAT),
    libraryCode: text('o código da biblioteca', 60).meta({
      example: '1163 · Biblioteca · Livros',
    }),
    acquisitionYear: yearSchema.optional(),
  })
  .meta({ id: 'CopyInput' })

// Corpo de POST /librarian/books (RF-GAC-02). CDU, Cutter e estante são sempre
// preenchidos à mão; o resto pode vir da consulta ao Google Books.
export const createBookBodySchema = z
  .object({
    isbn: z.preprocess(blankToUndefined, isbnSchema.optional()),
    volumeId: optionalText('o id do volume', 100).meta({
      description: 'Vem de GET /librarian/google-books/:isbn.',
    }),
    title: text('o título', 300),
    subtitle: optionalText('o subtítulo', 300),
    authors: authorsSchema,
    translators: peopleSchema.default([]),
    publisher: optionalText('a editora', 200),
    publicationPlace: optionalText('o local de publicação', 200),
    edition: optionalText('a edição', 100),
    year: yearSchema.optional(),
    language: z
      .preprocess(blankToUndefined, text('o idioma', 40).optional())
      .default(DEFAULT_BOOK_LANGUAGE),
    materialType: z
      .preprocess(blankToUndefined, text('o tipo de material', 40).optional())
      .default(DEFAULT_MATERIAL_TYPE),
    series: optionalText('a série', 200),
    subjects: subjectsSchema.default([]),
    synopsis: optionalText('a sinopse', 10000),
    coverUrl: z.preprocess(blankToUndefined, coverUrlSchema.optional()),
    cdu: text('a CDU', 30).meta({ example: '005.1' }),
    cutter: text('o Cutter', 30).meta({ example: 'M386c' }),
    shelf: text('a estante', 60).meta({ example: 'Estante 005.1' }),
    location: z
      .preprocess(blankToUndefined, text('o local', 100).optional())
      .default(LIBRARY_PLACE),
    copies: z
      .array(copyInputSchema, 'Informe os exemplares.')
      .min(1, 'Informe ao menos um exemplar.')
      .max(50, 'Informe até 50 exemplares.'),
  })
  .refine((body) => body.volumeId === undefined || body.isbn !== undefined, {
    path: ['isbn'],
    error: 'Informe o ISBN do volume do Google Books.',
  })
  .meta({ id: 'CreateBookBody' })

// Corpo de PATCH /librarian/books/:bookId (RF-GAC-03, RF-GAC-06): só os campos
// enviados mudam; null apaga um campo opcional. workId, contadores, status e
// exemplares não são editáveis: enviar um deles é erro.
export const updateBookBodySchema = z
  .strictObject(
    {
      title: text('o título', 300).optional(),
      subtitle: clearableText('o subtítulo', 300),
      authors: authorsSchema.optional(),
      translators: peopleSchema.nullable().optional(),
      publisher: clearableText('a editora', 200),
      publicationPlace: clearableText('o local de publicação', 200),
      edition: clearableText('a edição', 100),
      year: yearSchema.nullable().optional(),
      language: text('o idioma', 40).optional(),
      materialType: text('o tipo de material', 40).optional(),
      series: clearableText('a série', 200),
      subjects: subjectsSchema.optional(),
      synopsis: clearableText('a sinopse', 10000),
      coverUrl: z.preprocess(blankToNull, coverUrlSchema.nullable().optional()),
      coverTone: coverToneSchema.optional(),
      cdu: text('a CDU', 30).optional(),
      cutter: text('o Cutter', 30).optional(),
      shelf: text('a estante', 60).optional(),
      location: text('o local', 100).optional(),
      isbn: z.preprocess(blankToNull, isbnSchema.nullable().optional()),
      unavailableForNewRequests: z
        .boolean('Informe se o livro está indisponível para novos pedidos.')
        .optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys'
          ? `Campos que não podem ser editados: ${issue.keys.join(', ')}.`
          : undefined,
    },
  )
  .refine((body) => Object.keys(body).length > 0, {
    error: 'Informe ao menos um campo para alterar.',
  })
  .meta({ id: 'UpdateBookBody' })
