import type { z } from 'zod'
import type { AuditActorRole, Book, Copy } from '../../shared/types/index.js'
import type {
  CATALOG_FILTERS,
  GOOGLE_SYNC_FIELDS,
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
  bookRecordSchema,
  bookSummarySchema,
  googleBookDataSchema,
  googleBookLookupResponseSchema,
  syncGoogleResponseSchema,
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
// Dados do Google Books no formato do livro (só o que o Google trouxe).
export type GoogleBookData = z.infer<typeof googleBookDataSchema>
// Resposta de GET /librarian/google-books/:isbn.
export type GoogleBookLookupResponse = z.infer<
  typeof googleBookLookupResponseSchema
>
// Resposta de POST /librarian/books/:bookId/sync-google.
export type SyncGoogleResponse = z.infer<typeof syncGoogleResponseSchema>

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

// Campo do livro que o Google Books pode trocar.
export type GoogleSyncField = (typeof GOOGLE_SYNC_FIELDS)[number]

// Quem faz a ação: o bibliotecário logado ou o sistema (script de importação).
export interface Actor {
  uid: string
  role: AuditActorRole
}

// --- Google Books --------------------------------------------------------------

// Resultado da consulta ao Google Books por ISBN: ISBN desconhecido ou o volume
// com os dados já mapeados.
export type GoogleLookup =
  { found: false } | { found: true; volumeId: string; data: GoogleBookData }

// --- Cadastro ----------------------------------------------------------------

// Livro e exemplares prontos para gravar.
export interface NewBook {
  id: string
  book: Book
  copies: { id: string; copy: Copy }[]
}
