import type { BookRecord } from '../../../shared/types/index.js'
import {
  SUBJECTS_PER_BOOK,
  SYNOPSIS_MAX_LENGTH,
} from '../assistant.constants.js'

// O livro no formato que vai ao Gemini (RF-ASS-02, RF-ASS-07): só dados do
// acervo, nunca quem pegou o livro.
export interface ToolBook {
  bookId: string
  title: string
  authors: string[]
  subjects: string[]
  year: number | null
  synopsis: string | null
  copiesAvailable: number
  queueLength: number
  unavailableForNewRequests: boolean
}

// Corta o texto no limite, terminando com reticências.
function clip(text: string | undefined, max: number): string | null {
  if (!text) return null
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// Converte o livro do acervo no formato da ferramenta.
export function toToolBook(book: BookRecord): ToolBook {
  return {
    bookId: book.id,
    title: book.title,
    authors: book.authors,
    subjects: book.subjects.slice(0, SUBJECTS_PER_BOOK),
    year: book.year ?? null,
    synopsis: clip(book.synopsis, SYNOPSIS_MAX_LENGTH),
    copiesAvailable: book.copiesAvailable,
    queueLength: book.queueLength,
    unavailableForNewRequests: book.unavailableForNewRequests,
  }
}
