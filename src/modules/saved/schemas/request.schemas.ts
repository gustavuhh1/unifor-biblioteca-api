import { z } from 'zod'
import { FOLDER_NAME_MAX_LENGTH } from '../saved.constants.js'

// Schemas de entrada do módulo de Salvos. As mensagens são em português. O
// parâmetro :bookId usa bookParamsSchema, do acervo.

// Parâmetro :folderId das rotas de uma pasta.
export const folderParamsSchema = z.object({
  folderId: z.string().min(1).max(200),
})

// Parâmetros de /me/folders/:folderId/books/:bookId.
export const folderBookParamsSchema = z.object({
  folderId: z.string().min(1).max(200),
  bookId: z.string().min(1).max(200),
})

// Query de GET /me/saved (RF-SAL-01, RF-SAL-03): sem pasta, "Todos os salvos".
export const savedListQuerySchema = z
  .object({
    folderId: z.string().min(1).max(200).optional().meta({
      description:
        'Só os livros desta pasta. Sem ela, vêm todos os livros salvos.',
    }),
  })
  .meta({ id: 'SavedListQuery' })

// Corpo de POST /me/folders e PATCH /me/folders/:folderId (RF-SAL-02).
export const folderBodySchema = z
  .object({
    name: z
      .string('Informe o nome da pasta.')
      .trim()
      .min(1, 'Informe o nome da pasta.')
      .max(
        FOLDER_NAME_MAX_LENGTH,
        `O nome da pasta deve ter no máximo ${FOLDER_NAME_MAX_LENGTH} caracteres.`,
      )
      .meta({ description: 'De 1 a 30 caracteres. Ex.: "Ler depois".' }),
  })
  .meta({ id: 'FolderBody' })
