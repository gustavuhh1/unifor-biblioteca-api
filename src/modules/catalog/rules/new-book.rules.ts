import { buildSearchText } from '../../../shared/search-text.js'
import {
  BOOK_STATUS,
  COPY_STATUS,
  type Book,
  type Copy,
  type DataSource,
  type ExternalMetadataInfo,
} from '../../../shared/types/index.js'
import type { CopyInput, CreateBookBody } from '../catalog.types.js'
import { coverToneOf } from './cover-tone.rules.js'

// Monta o documento books de uma edição nova (seção 2.7): ativa, com os
// contadores coerentes com os exemplares (todos disponíveis), sem fila, cor da
// capa derivada da obra e texto de busca. Campo opcional sem valor não entra.
export function buildNewBook(
  body: CreateBookBody,
  context: {
    workId: string
    createdBy: string
    dataSource: DataSource
    externalMetadata: ExternalMetadataInfo | undefined
    at: Date
  },
): Book {
  const { workId, createdBy, dataSource, externalMetadata, at } = context
  return {
    workId,
    isbn: body.isbn,
    title: body.title,
    subtitle: body.subtitle,
    authors: body.authors,
    translators: body.translators.length > 0 ? body.translators : undefined,
    publisher: body.publisher,
    publicationPlace: body.publicationPlace,
    edition: body.edition,
    year: body.year,
    language: body.language,
    materialType: body.materialType,
    series: body.series,
    subjects: body.subjects,
    synopsis: body.synopsis,
    coverUrl: body.coverUrl ?? null,
    coverTone: coverToneOf(workId),
    cdu: body.cdu,
    cutter: body.cutter,
    shelf: body.shelf,
    location: body.location,
    externalMetadata,
    dataSource,
    copiesTotal: body.copies.length,
    copiesAvailable: body.copies.length,
    queueLength: 0,
    unavailableForNewRequests: false,
    status: BOOK_STATUS.active,
    searchText: buildSearchText(body),
    createdBy,
    createdAt: at,
    updatedAt: at,
  }
}

// Monta o documento copies de um exemplar novo (seção 2.8): disponível, com o
// workId copiado do livro.
export function buildNewCopy(
  input: CopyInput,
  context: { bookId: string; workId: string; at: Date },
): Copy {
  return {
    bookId: context.bookId,
    workId: context.workId,
    registration: input.registration,
    acquisitionYear: input.acquisitionYear,
    format: input.format,
    libraryCode: input.libraryCode,
    status: COPY_STATUS.available,
    createdAt: context.at,
    updatedAt: context.at,
  }
}
