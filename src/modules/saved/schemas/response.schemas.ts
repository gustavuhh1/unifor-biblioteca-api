import { z } from 'zod'
import { bookSummarySchema } from '../../catalog/schemas/response.schemas.js'
import { isoDateSchema as isoDate } from '../../../shared/iso-date.js'

// Schemas de saída do módulo de Salvos. Também alimentam o Swagger. Data vai em
// ISO 8601 (UTC).

// Um livro salvo (RF-SAL-01): o card do acervo mais quando foi salvo e em quais
// pastas está.
export const savedBookSchema = bookSummarySchema
  .extend({
    savedAt: isoDate,
    folderIds: z.array(z.string()).meta({
      description:
        'As pastas em que o livro está. Vazio: só em "Todos os salvos".',
    }),
  })
  .meta({ id: 'SavedBook' })

// Resposta de GET /me/saved.
export const savedBooksResponseSchema = z
  .object({ items: z.array(savedBookSchema) })
  .meta({ id: 'SavedBooksResponse' })

// Uma pasta de Salvos (RF-SAL-02).
export const folderSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    bookCount: z.number().int().min(0),
  })
  .meta({ id: 'Folder' })

// Resposta de GET /me/folders: "Todos os salvos" (a contagem) e as pastas.
export const foldersResponseSchema = z
  .object({
    savedCount: z.number().int().min(0).meta({
      description: 'Quantos livros há em "Todos os salvos".',
    }),
    items: z.array(folderSchema).meta({
      description: 'As pastas, da mais antiga para a mais nova.',
    }),
  })
  .meta({ id: 'FoldersResponse' })
