import { z } from 'zod'

// O que a API lê das respostas do Google Books. O resto é ignorado.

// Resposta de volumes?q=isbn:{isbn}: quantos volumes e o id de cada um.
export const volumeSearchSchema = z.object({
  totalItems: z.number().optional(),
  items: z.array(z.object({ id: z.string() })).optional(),
})

// Resposta de volumes/{volumeId}: o volumeInfo, só com os campos que o livro usa.
export const volumeSchema = z.object({
  volumeInfo: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    authors: z.array(z.string()).optional(),
    publisher: z.string().optional(),
    publishedDate: z.string().optional(),
    description: z.string().optional(),
    categories: z.array(z.string()).optional(),
    language: z.string().optional(),
    imageLinks: z
      .object({
        thumbnail: z.string().optional(),
        smallThumbnail: z.string().optional(),
      })
      .optional(),
  }),
})
