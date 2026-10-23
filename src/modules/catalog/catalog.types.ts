import type { z } from 'zod'
import type {
  AuditActorRole,
  Book,
  BookMetadataSource,
  Copy,
} from '../../shared/types/index.js'
import type {
  CATALOG_FILTERS,
  LOOKUP_STATUS,
  METADATA_SYNC_FIELDS,
} from './catalog.constants.js'
import type {
  copyInputSchema,
  createBookBodySchema,
  librarianListBooksQuerySchema,
  listBooksQuerySchema,
  updateBookBodySchema,
} from './schemas/request.schemas.js'
import type {
  actionBlockSchema,
  bookDetailSchema,
  bookMetadataLookupResponseSchema,
  bookMetadataSchema,
  bookRecordSchema,
  bookSummarySchema,
  syncBookResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo do acervo. Os documentos das coleções e os enums
// ficam em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

// Query de GET /books.
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>
// Query de GET /librarian/books.
export type LibrarianListBooksQuery = z.infer<
  typeof librarianListBooksQuerySchema
>
// Corpo de POST /librarian/books.
export type CreateBookBody = z.infer<typeof createBookBodySchema>
// Um exemplar do corpo de POST /librarian/books.
export type CopyInput = z.infer<typeof copyInputSchema>
// Corpo de PATCH /librarian/books/:bookId.
export type UpdateBookBody = z.infer<typeof updateBookBodySchema>
// Card do livro na busca.
export type BookSummary = z.infer<typeof bookSummarySchema>
// Página do livro.
export type BookDetail = z.infer<typeof bookDetailSchema>
// Bloco de ação da página do livro.
export type ActionBlock = z.infer<typeof actionBlockSchema>
// Registro completo do livro, para o bibliotecário.
export type BookRecordResponse = z.infer<typeof bookRecordSchema>
// Dados das fontes externas no formato do livro (só o que elas trouxeram).
export type BookMetadata = z.infer<typeof bookMetadataSchema>
// Resposta de GET /librarian/books/isbn/:isbn.
export type BookMetadataLookupResponse = z.infer<
  typeof bookMetadataLookupResponseSchema
>
// Resposta de POST /librarian/books/:bookId/sync.
export type SyncBookResponse = z.infer<typeof syncBookResponseSchema>

// --- Acervo ------------------------------------------------------------------

// Resposta paginada de uma lista de itens.
export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// Filtro da lista do bibliotecário.
export type CatalogFilter = (typeof CATALOG_FILTERS)[number]

// Campo do livro que as fontes externas podem trocar.
export type MetadataSyncField = (typeof METADATA_SYNC_FIELDS)[number]

// Quem faz a ação: o bibliotecário logado ou o sistema (script de importação).
export interface Actor {
  uid: string
  role: AuditActorRole
}

// --- Fontes externas -----------------------------------------------------------

// Resultado da consulta a UMA fonte (Open Library ou BrasilAPI) por ISBN: achou
// (com os dados já mapeados), o ISBN não existe ali, ou a fonte não respondeu.
// A Open Library também devolve a chave do livro.
export type SourceLookup =
  | {
      status: typeof LOOKUP_STATUS.found
      data: BookMetadata
      openLibraryKey?: string
    }
  | { status: typeof LOOKUP_STATUS.notFound }
  | { status: typeof LOOKUP_STATUS.unavailable }

// Resultado das duas fontes combinadas: achou em pelo menos uma (com as fontes
// que contribuíram), nenhuma conhece o ISBN, ou nenhuma achou e alguma não
// respondeu (não dá para dizer que o ISBN não existe).
export type BookMetadataLookup =
  | {
      status: typeof LOOKUP_STATUS.found
      sources: BookMetadataSource[]
      data: BookMetadata
      openLibraryKey?: string
    }
  | { status: typeof LOOKUP_STATUS.notFound }
  | { status: typeof LOOKUP_STATUS.unavailable }

// --- Cadastro ----------------------------------------------------------------

// Livro e exemplares prontos para gravar.
export interface NewBook {
  id: string
  book: Book
  copies: { id: string; copy: Copy }[]
}
