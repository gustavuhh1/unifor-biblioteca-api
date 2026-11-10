import type { BookMetadata } from '../../../src/modules/catalog/catalog.types.js'
import { normalizeText } from '../../../src/shared/text.js'
import type { BookMetadataSource } from '../../../src/shared/types/index.js'
import { workIdOf } from '../../../src/shared/work-id.js'
import type { BookSpec } from '../data.js'
import type { CatalogArea } from './areas.js'

// Máximo de exemplares por título no acervo gerado (decisão de 10/11/2026).
export const MAX_COPIES_PER_TITLE = 4
// Primeiro número de tombo do acervo gerado: acima de todos os da seção 6.2.
export const FIRST_CATALOG_REGISTRATION = 400001
// Títulos mais longos que isso costumam ser registros malformados na fonte.
export const MAX_TITLE_LENGTH = 120

// Quantos exemplares cada título ganha, num ciclo fixo de 1 a 4 (o seed fica
// determinístico: o mesmo JSON gera sempre o mesmo acervo).
const COPY_CYCLE = [2, 1, 3, 2, 4, 1, 2, 3, 1, 2]

// Palavras ignoradas no começo do título ao montar o Cutter.
const LEADING_ARTICLES = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'the'])

// Livro do acervo gerado: o mesmo formato de BookSpec, com a capa e as fontes
// que trouxeram os dados (RF-ACE-04).
export interface CatalogBookSpec extends BookSpec {
  coverUrl: string
  metadataSources: BookMetadataSource[]
  openLibraryKey?: string
}

// Escolhe o ISBN de uma edição brasileira (prefixo 85 ou 65) e devolve só os
// dígitos, preferindo o ISBN-13. Sem edição brasileira, devolve null.
export function pickBrazilianIsbn(isbns: readonly string[]): string | null {
  const digits = isbns.map((isbn) =>
    isbn.replace(/[^0-9Xx]/g, '').toUpperCase(),
  )
  const isbn13 = digits.find((isbn) => /^97[89](85|65)\d{8}$/.test(isbn))
  if (isbn13) return isbn13
  return digits.find((isbn) => /^(85|65)\d{7}[\dX]$/.test(isbn)) ?? null
}

// Quantos exemplares o título de posição `index` ganha (1 a 4).
export function copyCountOf(index: number): number {
  return COPY_CYCLE[index % COPY_CYCLE.length] ?? 1
}

// Cutter de exemplo (dado do projeto, como na seção 6.2): inicial do sobrenome,
// três dígitos tirados do sobrenome e a inicial do título, sem artigo
// ("Robert C. Martin", "Código Limpo" vira algo como "M386c").
export function cutterOf(author: string, title: string): string {
  const [beforeComma = ''] = author.split(',')
  const words = (author.includes(',') ? beforeComma : author)
    .trim()
    .split(/\s+/)
  const surname = normalizeText(words[words.length - 1] ?? '').replace(
    /[^a-z]/g,
    '',
  )
  const initial = (surname[0] ?? 'x').toUpperCase()
  let hash = 0
  for (const char of surname) hash = (hash * 31 + char.charCodeAt(0)) % 900
  const titleWords = normalizeText(title)
    .split(/\s+/)
    .filter((word) => /[a-z]/.test(word))
  const firstWord =
    titleWords.find((word) => !LEADING_ARTICLES.has(word)) ??
    titleWords[0] ??
    'x'
  return `${initial}${hash + 100}${firstWord[0] ?? 'x'}`
}

// O livro é da área: alguma palavra do título ou dos assuntos (minúsculas, sem
// acento) começa com uma das palavras-chave da área.
export function matchesArea(
  area: Pick<CatalogArea, 'keywords'>,
  title: string,
  subjects: readonly string[],
): boolean {
  const text = ` ${normalizeText([title, ...subjects].join(' '))}`
  return area.keywords.some((keyword) => text.includes(` ${keyword}`))
}

// Monta o livro do acervo a partir dos dados das fontes externas. Devolve null
// quando falta o que a página do livro precisa (título, autor ou capa) ou quando o
// livro não é da área (título e assuntos sem nenhuma palavra-chave dela).
export function toCatalogBook(input: {
  area: CatalogArea
  isbn: string
  metadata: BookMetadata
  sources: BookMetadataSource[]
  openLibraryKey?: string
  index: number
  firstRegistration: number
}): CatalogBookSpec | null {
  const { area, isbn, metadata, index, firstRegistration } = input
  const title = metadata.title?.trim()
  const authors = (metadata.authors ?? []).map((a) => a.trim()).filter(Boolean)
  const coverUrl = metadata.coverUrl
  if (!title || title.length > MAX_TITLE_LENGTH) return null
  if (authors.length === 0 || !coverUrl) return null
  if (!matchesArea(area, title, metadata.subjects ?? [])) return null

  const copies = Array.from({ length: copyCountOf(index) }, (_, i) => ({
    registration: String(firstRegistration + i),
  }))
  return {
    key: `acervo_${isbn}`,
    workId: workIdOf(title, authors),
    title,
    ...(metadata.subtitle ? { subtitle: metadata.subtitle } : {}),
    authors,
    ...(metadata.publisher ? { publisher: metadata.publisher } : {}),
    ...(metadata.year ? { year: metadata.year } : {}),
    isbn,
    subjects: area.subjects,
    ...(metadata.synopsis ? { synopsis: metadata.synopsis } : {}),
    cdu: area.cdu,
    cutter: cutterOf(authors[0] ?? '', title),
    copies,
    coverUrl,
    metadataSources: input.sources,
    ...(input.openLibraryKey ? { openLibraryKey: input.openLibraryKey } : {}),
  }
}
