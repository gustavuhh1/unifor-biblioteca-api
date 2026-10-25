import type { z } from 'zod'
import type {
  folderBodySchema,
  folderBookParamsSchema,
  folderParamsSchema,
  savedListQuerySchema,
} from './schemas/request.schemas.js'
import type {
  folderSchema,
  foldersResponseSchema,
  savedBookSchema,
  savedBooksResponseSchema,
} from './schemas/response.schemas.js'

// Tipos exclusivos do módulo de Salvos. Os documentos (SavedBook, Folder) ficam
// em shared/types.

// --- Inferidos dos schemas das requisições e das respostas -------------------

export type FolderParams = z.infer<typeof folderParamsSchema>
export type FolderBookParams = z.infer<typeof folderBookParamsSchema>
export type SavedListQuery = z.infer<typeof savedListQuerySchema>
export type FolderBody = z.infer<typeof folderBodySchema>
export type SavedBookResponse = z.infer<typeof savedBookSchema>
export type SavedBooksResponse = z.infer<typeof savedBooksResponseSchema>
export type FolderResponse = z.infer<typeof folderSchema>
export type FoldersResponse = z.infer<typeof foldersResponseSchema>
