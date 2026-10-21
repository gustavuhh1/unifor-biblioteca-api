import {
  COPY_STATUS,
  type BookRecord,
  type CopyRecord,
} from '../../../shared/types/index.js'
import type {
  ActionBlock,
  BookDetail,
  BookRecordResponse,
  BookSummary,
} from '../catalog.types.js'

// Data em ISO 8601 (UTC), ou null quando o livro não tem a data.
const iso = (date: Date | undefined) => date?.toISOString() ?? null

// Card do livro na busca (RF-ACE-01): o resumo que a lista mostra.
export function toBookSummary(book: BookRecord): BookSummary {
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    coverUrl: book.coverUrl ?? null,
    coverTone: book.coverTone,
    copiesTotal: book.copiesTotal,
    copiesAvailable: book.copiesAvailable,
    queueLength: book.queueLength,
    nextReturnAt: iso(book.nextReturnAt),
    unavailableForNewRequests: book.unavailableForNewRequests,
  }
}

// Os campos de exibição que a página do livro e o registro do bibliotecário têm
// em comum. Nunca inclui searchText, createdBy, removedBy etc.
function displayFields(book: BookRecord) {
  return {
    id: book.id,
    workId: book.workId,
    isbn: book.isbn ?? null,
    title: book.title,
    subtitle: book.subtitle ?? null,
    authors: book.authors,
    translators: book.translators ?? [],
    publisher: book.publisher ?? null,
    publicationPlace: book.publicationPlace ?? null,
    edition: book.edition ?? null,
    year: book.year ?? null,
    language: book.language,
    materialType: book.materialType,
    series: book.series ?? null,
    subjects: book.subjects,
    synopsis: book.synopsis ?? null,
    coverUrl: book.coverUrl ?? null,
    coverTone: book.coverTone,
    cdu: book.cdu,
    cutter: book.cutter,
    shelf: book.shelf,
    location: book.location,
    copiesTotal: book.copiesTotal,
    copiesAvailable: book.copiesAvailable,
    queueLength: book.queueLength,
    nextReturnAt: iso(book.nextReturnAt),
    unavailableForNewRequests: book.unavailableForNewRequests,
  }
}

// Página do livro (RF-ACE-02, RF-ACE-03, RF-ACE-08): campos de exibição, resumo
// dos exemplares (os retirados do acervo não aparecem, e a ordem é a do
// registro) e o bloco de ação, que só o aluno recebe.
export function toBookDetail(
  book: BookRecord,
  copies: readonly CopyRecord[],
  action: ActionBlock | null,
): BookDetail {
  return {
    ...displayFields(book),
    copies: copies
      .filter((copy) => copy.status !== COPY_STATUS.withdrawn)
      .map(({ registration, format, status }) => ({
        registration,
        format,
        status,
      }))
      .sort((a, b) =>
        a.registration.localeCompare(b.registration, 'pt-BR', {
          numeric: true,
        }),
      ),
    action,
  }
}

// Registro completo do livro para o bibliotecário (RF-GAC-01): os campos de
// exibição, a origem dos dados, a marca de indisponível e as datas; só o
// searchText fica de fora.
export function toBookRecordResponse(book: BookRecord): BookRecordResponse {
  return {
    ...displayFields(book),
    googleBooks: book.googleBooks
      ? {
          volumeId: book.googleBooks.volumeId,
          lastSyncedAt: iso(book.googleBooks.lastSyncedAt ?? undefined),
          found: book.googleBooks.found,
        }
      : null,
    dataSource: book.dataSource,
    unavailableSetAt: iso(book.unavailableSetAt),
    unavailableSetBy: book.unavailableSetBy ?? null,
    status: book.status,
    createdBy: book.createdBy ?? null,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  }
}
