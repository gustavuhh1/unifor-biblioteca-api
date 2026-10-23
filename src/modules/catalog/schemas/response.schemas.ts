import { z } from 'zod'
import {
  BLOCKED_REASONS,
  BOOK_METADATA_SOURCES,
  BOOK_STATUSES,
  COPY_STATUSES,
  DATA_SOURCES,
  ELIGIBILITY_ACTIONS,
} from '../../../shared/types/index.js'
import { COVER_TONE_COUNT, METADATA_SYNC_FIELDS } from '../catalog.constants.js'

// Schemas de saída do módulo do acervo. Também alimentam o Swagger. Data vai em
// ISO 8601 (UTC); campo opcional que o livro não tem vai como null.

const isoDate = z.iso.datetime()
const nullableText = z.string().nullable()

// --- Livro para o aluno --------------------------------------------------------

// Resumo do livro no card da busca (RF-ACE-01).
export const bookSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    coverUrl: nullableText,
    coverTone: z.number().int().min(1).max(COVER_TONE_COUNT),
    copiesTotal: z.number().int(),
    copiesAvailable: z.number().int(),
    queueLength: z.number().int(),
    nextReturnAt: isoDate.nullable(),
    unavailableForNewRequests: z.boolean(),
  })
  .meta({ id: 'BookSummary' })

// Resposta paginada da busca do aluno (GET /books).
export const bookListResponseSchema = z
  .object({
    items: z.array(bookSummarySchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z
      .number()
      .int()
      .meta({ description: 'Livros que batem com a busca.' }),
    totalPages: z.number().int(),
  })
  .meta({ id: 'BookListResponse' })

// Um exemplar na página do livro (RF-ACE-02).
export const copySummarySchema = z
  .object({
    registration: z.string(),
    format: z.string(),
    status: z.enum(COPY_STATUSES),
  })
  .meta({ id: 'CopySummary' })

// O que o botão fixo da página do livro faz para este aluno (RF-ACE-08).
export const actionBlockSchema = z
  .object({
    suggestedAction: z.enum(ELIGIBILITY_ACTIONS).meta({
      description:
        '`request` quando há exemplar disponível; `join_queue` quando não há.',
    }),
    allowed: z.boolean(),
    blockedReason: z.enum(BLOCKED_REASONS).optional().meta({
      description: 'Só quando `allowed` é false.',
    }),
  })
  .meta({ id: 'ActionBlock' })

// Página do livro (GET /books/:bookId): campos de exibição, exemplares e, para
// o aluno, o bloco de ação.
export const bookDetailSchema = z
  .object({
    id: z.string(),
    workId: z.string(),
    isbn: nullableText,
    title: z.string(),
    subtitle: nullableText,
    authors: z.array(z.string()),
    translators: z.array(z.string()),
    publisher: nullableText,
    publicationPlace: nullableText,
    edition: nullableText,
    year: z.number().int().nullable(),
    language: z.string(),
    materialType: z.string(),
    series: nullableText,
    subjects: z.array(z.string()),
    synopsis: nullableText,
    coverUrl: nullableText,
    coverTone: z.number().int().min(1).max(COVER_TONE_COUNT),
    cdu: z.string(),
    cutter: z.string(),
    shelf: z.string(),
    location: z.string(),
    copies: z.array(copySummarySchema),
    copiesTotal: z.number().int(),
    copiesAvailable: z.number().int(),
    queueLength: z.number().int(),
    nextReturnAt: isoDate.nullable(),
    unavailableForNewRequests: z.boolean(),
    action: actionBlockSchema.nullable().meta({
      description: 'Só para o aluno; para o bibliotecário vem null.',
    }),
  })
  .meta({ id: 'BookDetail' })

// --- Livro para o bibliotecário ------------------------------------------------

// Dados da última consulta às fontes externas (Open Library e BrasilAPI).
export const externalMetadataInfoSchema = z
  .object({
    sources: z.array(z.enum(BOOK_METADATA_SOURCES)),
    openLibraryKey: nullableText,
    lastSyncedAt: isoDate.nullable(),
    found: z.boolean(),
  })
  .meta({ id: 'ExternalMetadataInfo' })

// Registro completo do livro (tudo menos o searchText), que a tela de edição do
// bibliotecário usa (RF-GAC-01).
export const bookRecordSchema = z
  .object({
    id: z.string(),
    workId: z.string(),
    isbn: nullableText,
    title: z.string(),
    subtitle: nullableText,
    authors: z.array(z.string()),
    translators: z.array(z.string()),
    publisher: nullableText,
    publicationPlace: nullableText,
    edition: nullableText,
    year: z.number().int().nullable(),
    language: z.string(),
    materialType: z.string(),
    series: nullableText,
    subjects: z.array(z.string()),
    synopsis: nullableText,
    coverUrl: nullableText,
    coverTone: z.number().int().min(1).max(COVER_TONE_COUNT),
    cdu: z.string(),
    cutter: z.string(),
    shelf: z.string(),
    location: z.string(),
    externalMetadata: externalMetadataInfoSchema.nullable(),
    dataSource: z.enum(DATA_SOURCES),
    copiesTotal: z.number().int(),
    copiesAvailable: z.number().int(),
    queueLength: z.number().int(),
    nextReturnAt: isoDate.nullable(),
    unavailableForNewRequests: z.boolean(),
    unavailableSetAt: isoDate.nullable(),
    unavailableSetBy: nullableText,
    status: z.enum(BOOK_STATUSES),
    createdBy: nullableText,
    createdAt: isoDate,
    updatedAt: isoDate,
  })
  .meta({ id: 'BookRecord' })

// Resposta paginada da lista do bibliotecário (GET /librarian/books).
export const librarianBookListResponseSchema = z
  .object({
    items: z.array(bookRecordSchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  })
  .meta({ id: 'LibrarianBookListResponse' })

// --- Fontes externas ------------------------------------------------------------

// Dados das fontes externas já no formato do livro; só vêm os campos que as
// fontes trouxeram (RF-ACE-04).
export const bookMetadataSchema = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    authors: z.array(z.string()).optional(),
    publisher: z.string().optional(),
    year: z.number().int().optional(),
    synopsis: z.string().optional(),
    subjects: z.array(z.string()).optional(),
    coverUrl: z.string().optional(),
  })
  .meta({ id: 'BookMetadata' })

// Resposta de GET /librarian/books/isbn/:isbn: os dados para pré-preencher o
// cadastro. ISBN que nenhuma fonte conhece volta com found false (RF-GAC-02).
export const bookMetadataLookupResponseSchema = z
  .object({
    found: z.boolean(),
    sources: z.array(z.enum(BOOK_METADATA_SOURCES)),
    openLibraryKey: nullableText,
    book: bookMetadataSchema.nullable(),
  })
  .meta({ id: 'BookMetadataLookupResponse' })

// Resposta de POST /librarian/books/:bookId/sync (RF-GAC-04): o livro depois da
// atualização e os campos que mudaram.
export const syncBookResponseSchema = z
  .object({
    book: bookRecordSchema,
    changedFields: z.array(z.enum(METADATA_SYNC_FIELDS)),
  })
  .meta({ id: 'SyncBookResponse' })
