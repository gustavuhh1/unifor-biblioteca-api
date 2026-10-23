import { z } from 'zod'

// O que a API lê da resposta da Open Library (api/books?jscmd=data). O resto é
// ignorado, e campo ausente ou null conta como vazio.

const named = z.object({ name: z.string().nullish() })

// Um livro da resposta: título, autores, editora, data de publicação, assuntos,
// capa e a chave do livro na Open Library.
export const openLibraryEntrySchema = z.object({
  key: z.string().nullish(),
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  authors: z.array(named).nullish(),
  publishers: z.array(named).nullish(),
  publish_date: z.string().nullish(),
  subjects: z.array(named).nullish(),
  cover: z
    .object({
      large: z.string().nullish(),
      medium: z.string().nullish(),
      small: z.string().nullish(),
    })
    .nullish(),
})

// A resposta inteira: um objeto com um livro por chave pedida ("ISBN:{isbn}").
// ISBN desconhecido volta como objeto vazio.
export const openLibraryResponseSchema = z.record(
  z.string(),
  openLibraryEntrySchema,
)
