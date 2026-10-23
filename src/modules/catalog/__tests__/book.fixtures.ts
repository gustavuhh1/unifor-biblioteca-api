import { buildSearchText } from '../../../shared/search-text.js'
import type { BookRecord, Copy } from '../../../shared/types/index.js'

// Instante fixo dos testes do acervo (21/10/2026, 15:00 UTC).
export const AT = new Date('2026-10-21T15:00:00Z')

// Livro ativo de exemplo (o Código Limpo do seed), que cada teste ajusta.
export function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
  const book: BookRecord = {
    id: 'book_codigo_limpo',
    workId: 'codigo-limpo--martin',
    isbn: '9788576082675',
    title: 'Código Limpo',
    subtitle: 'habilidades práticas do agile software',
    authors: ['Robert C. Martin'],
    translators: ['Leandro Chu'],
    publisher: 'Alta Books',
    publicationPlace: 'Rio de Janeiro',
    edition: 'revisada',
    year: 2011,
    language: 'Português',
    materialType: 'Livro',
    series: '(Robert C. Martin)',
    subjects: ['Desenvolvimento de software', 'Linguagem de programação'],
    synopsis: 'Mostra como escrever código fácil de ler e de manter.',
    coverUrl: null,
    coverTone: 1,
    cdu: '005.1',
    cutter: 'M386c',
    shelf: 'Estante 005.1',
    location: 'Biblioteca (Praça Central)',
    externalMetadata: {
      sources: ['open_library'],
      openLibraryKey: '/books/OL123M',
      lastSyncedAt: AT,
      found: true,
    },
    dataSource: 'mixed',
    copiesTotal: 3,
    copiesAvailable: 0,
    queueLength: 1,
    unavailableForNewRequests: false,
    status: 'active',
    searchText: '',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
  return {
    ...book,
    searchText: overrides.searchText ?? buildSearchText(book),
  }
}

// Exemplar de exemplo.
export function makeCopy(overrides: Partial<Copy> = {}): Copy {
  return {
    bookId: 'book_codigo_limpo',
    workId: 'codigo-limpo--martin',
    registration: '46122',
    format: 'Impresso',
    libraryCode: '1163 · Biblioteca · Livros',
    status: 'available',
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  }
}
