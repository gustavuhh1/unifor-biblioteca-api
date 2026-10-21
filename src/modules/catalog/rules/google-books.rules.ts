import { buildSearchText } from '../../../shared/search-text.js'
import type { Book } from '../../../shared/types/index.js'
import {
  GOOGLE_LANGUAGE_NAMES,
  GOOGLE_SYNC_FIELDS,
} from '../catalog.constants.js'
import type {
  GoogleBookData,
  GoogleLookup,
  GoogleSyncField,
} from '../catalog.types.js'
import { dataSourceAfterSync } from './data-source.rules.js'
import { sameValue } from './same-value.rules.js'

// O `volumeInfo` de um volume do Google Books, só com o que a API lê.
export interface GoogleVolumeInfo {
  title?: string | undefined
  subtitle?: string | undefined
  authors?: string[] | undefined
  publisher?: string | undefined
  publishedDate?: string | undefined
  description?: string | undefined
  categories?: string[] | undefined
  language?: string | undefined
  imageLinks?:
    | { thumbnail?: string | undefined; smallThumbnail?: string | undefined }
    | undefined
}

// Entidades HTML que aparecem nas sinopses do Google Books.
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

// Tira as tags HTML da sinopse (RF-ACE-04). Quebra de linha e fim de parágrafo
// viram quebra de linha; as outras tags somem. Devolve texto simples.
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
      (entity) => HTML_ENTITIES[entity]!,
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Texto sem espaços nas pontas; texto vazio vira undefined.
const cleanText = (text: string | undefined) => text?.trim() || undefined

// Lista sem itens vazios nem repetidos; lista vazia vira undefined.
function cleanList(list: string[] | undefined): string[] | undefined {
  const items = [
    ...new Set((list ?? []).map((item) => item.trim()).filter(Boolean)),
  ]
  return items.length > 0 ? items : undefined
}

// Nome do idioma (books.language) de um código do Google Books ("pt", "pt-BR").
// Código desconhecido devolve undefined: o idioma salvo não muda.
function languageOf(code: string | undefined): string | undefined {
  const base = code?.trim().toLowerCase().split('-')[0]
  return base ? GOOGLE_LANGUAGE_NAMES[base] : undefined
}

// Quatro primeiros dígitos de publishedDate ("2011-03-01" vira 2011).
function yearOf(publishedDate: string | undefined): number | undefined {
  const digits = /^\d{4}/.exec(publishedDate?.trim() ?? '')?.[0]
  return digits ? Number(digits) : undefined
}

// Endereço da capa, sempre em https (o Google Books às vezes manda http).
function coverUrlOf(info: GoogleVolumeInfo): string | undefined {
  const url = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail
  return url?.trim() ? url.trim().replace(/^http:\/\//i, 'https://') : undefined
}

// Mapeia o `volumeInfo` do Google Books para os campos do livro (RF-ACE-04). Só
// entra no resultado o que o Google trouxe: campo ausente não vira valor vazio,
// para não apagar o que já está salvo.
export function mapVolumeInfo(info: GoogleVolumeInfo): GoogleBookData {
  const data: GoogleBookData = {
    title: cleanText(info.title),
    subtitle: cleanText(info.subtitle),
    authors: cleanList(info.authors),
    publisher: cleanText(info.publisher),
    year: yearOf(info.publishedDate),
    synopsis: cleanText(info.description && stripHtml(info.description)),
    subjects: cleanList(info.categories),
    language: languageOf(info.language),
    coverUrl: coverUrlOf(info),
  }
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as GoogleBookData
}

// O que gravar no livro depois de combinar o salvo com a resposta do Google.
export interface GoogleSyncUpdate {
  // Só os campos que mudam, mais googleBooks, searchText, dataSource e updatedAt.
  update: Partial<Book>
  // Os campos de conteúdo que mudaram, para o app mostrar (sem googleBooks).
  changedFields: GoogleSyncField[]
}

// Combina os dados salvos do livro com a resposta do Google Books (RF-GAC-04,
// RF-ACE-04). Troca SOMENTE title, subtitle, authors, publisher, year, synopsis,
// coverUrl, subjects, language e googleBooks; nunca cdu, cutter, shelf, location,
// exemplares, contadores, workId nem status. Campo que o Google não trouxe não
// apaga o valor salvo. ISBN que o Google não achou só atualiza googleBooks
// (found false). `at` é o horário real da atualização.
export function applyGoogleLookup(
  saved: Book,
  lookup: GoogleLookup,
  at: Date,
): GoogleSyncUpdate {
  if (!lookup.found) {
    return {
      update: {
        googleBooks: {
          volumeId: saved.googleBooks?.volumeId ?? null,
          lastSyncedAt: at,
          found: false,
        },
        updatedAt: at,
      },
      changedFields: [],
    }
  }

  const changes: Partial<Pick<Book, GoogleSyncField>> = {}
  const changedFields: GoogleSyncField[] = []
  for (const field of GOOGLE_SYNC_FIELDS) {
    const value = lookup.data[field]
    if (value !== undefined && !sameValue(value, saved[field])) {
      Object.assign(changes, { [field]: value })
      changedFields.push(field)
    }
  }

  const merged = { ...saved, ...changes }
  return {
    update: {
      ...changes,
      googleBooks: {
        volumeId: lookup.volumeId,
        lastSyncedAt: at,
        found: true,
      },
      searchText: buildSearchText(merged),
      dataSource: dataSourceAfterSync(lookup.data),
      updatedAt: at,
    },
    changedFields,
  }
}
