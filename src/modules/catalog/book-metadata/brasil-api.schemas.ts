import { z } from 'zod'

// O que a API lê da resposta da BrasilAPI (isbn/v1/{isbn}). O resto é ignorado, e
// campo ausente ou null conta como vazio.
export const brasilApiBookSchema = z.object({
  title: z.string().nullish(),
  subtitle: z.string().nullish(),
  authors: z.array(z.string()).nullish(),
  publisher: z.string().nullish(),
  synopsis: z.string().nullish(),
  year: z.union([z.number(), z.string()]).nullish(),
  subjects: z.array(z.string()).nullish(),
  cover_url: z.string().nullish(),
})
