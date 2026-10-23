import type { z } from 'zod'
import type { brasilApiBookSchema } from '../book-metadata/brasil-api.schemas.js'
import { MAX_METADATA_SUBJECTS } from '../catalog.constants.js'
import type { BookMetadata } from '../catalog.types.js'
import {
  cleanList,
  cleanText,
  omitUndefined,
  secureUrl,
  stripHtml,
  yearOf,
} from './metadata-text.rules.js'

// A resposta da BrasilAPI, só com o que a API lê.
export type BrasilApiBook = z.infer<typeof brasilApiBookSchema>

// Mapeia a resposta da BrasilAPI para os campos do livro (RF-ACE-04). É a fonte
// da sinopse. Só entra no resultado o que a fonte trouxe.
export function mapBrasilApiBook(book: BrasilApiBook): BookMetadata {
  return omitUndefined({
    title: cleanText(book.title),
    subtitle: cleanText(book.subtitle),
    authors: cleanList(book.authors),
    publisher: cleanText(book.publisher),
    year: yearOf(book.year),
    synopsis: cleanText(book.synopsis && stripHtml(book.synopsis)),
    subjects: cleanList(book.subjects, MAX_METADATA_SUBJECTS),
    coverUrl: secureUrl(book.cover_url),
  })
}
