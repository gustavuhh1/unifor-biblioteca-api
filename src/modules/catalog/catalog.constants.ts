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

// Campos do livro que as fontes externas podem trocar (RF-GAC-04, seção 2.7).
// Nunca cdu, cutter, shelf, location, exemplares, contadores, workId, status nem
// idioma (nenhuma das fontes informa o idioma).
export const METADATA_SYNC_FIELDS = [
  'title',
  'subtitle',
  'authors',
  'publisher',
  'year',
  'synopsis',
  'coverUrl',
  'subjects',
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

// Fontes externas dos dados do livro: endereço de cada API, tempo máximo de cada
// chamada (RNF-CON-03) e o User-Agent que a Open Library pede.
export const OPEN_LIBRARY_BASE_URL = 'https://openlibrary.org'
export const BRASIL_API_BASE_URL = 'https://brasilapi.com.br/api'
export const BOOK_METADATA_TIMEOUT_MS = 5000
export const BOOK_METADATA_USER_AGENT = 'UniBooks/1.0 (+https://uni-books.app)'

// Quantos assuntos entram no livro: a Open Library chega a mandar mais de cem,
// e o cadastro aceita no máximo 50.
export const MAX_METADATA_SUBJECTS = 10

// Resultado de uma consulta a uma fonte (ou às duas combinadas): achou, o ISBN
// não existe ali, ou a fonte não respondeu (rede, tempo esgotado, 429, 5xx...).
export const LOOKUP_STATUSES = ['found', 'not_found', 'unavailable'] as const
export const LOOKUP_STATUS = constantsOf(LOOKUP_STATUSES)

// Quem faz a ação no auditLog quando é o sistema (script de importação,
// RF-ACE-05).
export const SYSTEM_ACTOR = { uid: 'system', role: 'system' } as const
