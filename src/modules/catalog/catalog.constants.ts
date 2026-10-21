import { constantsOf } from '../../shared/constants-of.js'

// Filtros da lista do acervo do bibliotecário (RF-GAC-01).
export const CATALOG_FILTERS = ['all', 'no_isbn', 'unavailable'] as const

// Os mesmos filtros com nome: CATALOG_FILTER.all, .noIsbn, .unavailable.
export const CATALOG_FILTER = constantsOf(CATALOG_FILTERS)

// Itens por página da busca (RF-ACE-01): o padrão e o máximo.
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 50

// Quantidade de cores da capa gerada (books.coverTone vai de 1 a este número).
export const COVER_TONE_COUNT = 6

// Campos do livro que o Google Books pode trocar (RF-GAC-04, seção 2.7). Nunca
// cdu, cutter, shelf, location, exemplares, contadores, workId nem status.
export const GOOGLE_SYNC_FIELDS = [
  'title',
  'subtitle',
  'authors',
  'publisher',
  'year',
  'synopsis',
  'coverUrl',
  'subjects',
  'language',
] as const

// Campos que dão a origem dos dados do livro (books.dataSource): título,
// autores, editora e sinopse.
export const DATA_SOURCE_FIELDS = [
  'title',
  'authors',
  'publisher',
  'synopsis',
] as const

// Sugestão devolvida quando o livro não pode ser removido (RF-GAC-05).
export const MARK_UNAVAILABLE_SUGGESTION = 'mark_unavailable'

// Google Books: endereço da API e tempo máximo de cada chamada (RNF-CON-03).
export const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1'
export const GOOGLE_BOOKS_TIMEOUT_MS = 4000

// Código de idioma do Google Books -> texto de books.language. Código fora desta
// lista não troca o idioma salvo.
export const GOOGLE_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  pt: 'Português',
  en: 'Inglês',
  es: 'Espanhol',
}

// Quem faz a ação no auditLog quando é o sistema (script de importação,
// RF-ACE-05).
export const SYSTEM_ACTOR = { uid: 'system', role: 'system' } as const
