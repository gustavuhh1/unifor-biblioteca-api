import type { z } from 'zod'
import type { openLibraryEntrySchema } from '../book-metadata/open-library.schemas.js'
import { MAX_METADATA_SUBJECTS } from '../catalog.constants.js'
import type { BookMetadata } from '../catalog.types.js'
import {
  cleanList,
  cleanText,
  omitUndefined,
  secureUrl,
  yearOf,
} from './metadata-text.rules.js'

// Um livro da resposta da Open Library, só com o que a API lê.
export type OpenLibraryEntry = z.infer<typeof openLibraryEntrySchema>

// Nomes de uma lista de objetos { name } (autores, editoras, assuntos).
const namesOf = (list: OpenLibraryEntry['authors']) =>
  list?.map((item) => item.name ?? '')

// Mapeia um livro da Open Library para os campos do livro (RF-ACE-04). A editora
// é a primeira da lista, o ano sai da data de publicação em texto livre e a capa
// é a maior. Só entra no resultado o que a fonte trouxe.
export function mapOpenLibraryEntry(entry: OpenLibraryEntry): BookMetadata {
  return omitUndefined({
    title: cleanText(entry.title),
    subtitle: cleanText(entry.subtitle),
    authors: cleanList(namesOf(entry.authors)),
    publisher: cleanList(namesOf(entry.publishers))?.[0],
    year: yearOf(entry.publish_date),
    subjects: cleanList(namesOf(entry.subjects), MAX_METADATA_SUBJECTS),
    coverUrl: secureUrl(
      entry.cover?.large ?? entry.cover?.medium ?? entry.cover?.small,
    ),
  })
}
