import { buildSearchText } from '../../../shared/search-text.js'
import {
  BOOK_METADATA_SOURCE,
  type Book,
  type BookMetadataSource,
  type ExternalMetadataInfo,
} from '../../../shared/types/index.js'
import { LOOKUP_STATUS, METADATA_SYNC_FIELDS } from '../catalog.constants.js'
import type {
  BookMetadataLookup,
  MetadataSyncField,
  SourceLookup,
} from '../catalog.types.js'
import { dataSourceAfterSync } from './data-source.rules.js'
import { sameValue } from './same-value.rules.js'

// Combina as respostas das duas fontes (RF-ACE-04). A Open Library vem primeiro
// em título, autores, capa e assuntos; a BrasilAPI traz a sinopse e preenche o
// campo que a Open Library deixou vazio. Se só uma achou, vale ela. Se nenhuma
// achou, é "não encontrado" quando todas responderam, ou "indisponível" quando
// alguma não respondeu (então não dá para afirmar que o ISBN não existe).
export function combineLookups(
  openLibrary: SourceLookup,
  brasilApi: SourceLookup,
): BookMetadataLookup {
  const sources: BookMetadataSource[] = []
  if (openLibrary.status === LOOKUP_STATUS.found) {
    sources.push(BOOK_METADATA_SOURCE.openLibrary)
  }
  if (brasilApi.status === LOOKUP_STATUS.found) {
    sources.push(BOOK_METADATA_SOURCE.brasilApi)
  }

  if (sources.length === 0) {
    const anyUnavailable = [openLibrary, brasilApi].some(
      (lookup) => lookup.status === LOOKUP_STATUS.unavailable,
    )
    return {
      status: anyUnavailable
        ? LOOKUP_STATUS.unavailable
        : LOOKUP_STATUS.notFound,
    }
  }

  return {
    status: LOOKUP_STATUS.found,
    sources,
    data: {
      ...(brasilApi.status === LOOKUP_STATUS.found ? brasilApi.data : {}),
      ...(openLibrary.status === LOOKUP_STATUS.found ? openLibrary.data : {}),
    },
    ...(openLibrary.status === LOOKUP_STATUS.found && openLibrary.openLibraryKey
      ? { openLibraryKey: openLibrary.openLibraryKey }
      : {}),
  }
}

// O que gravar em books.externalMetadata depois de uma consulta (RF-GAC-02,
// RF-GAC-04). Achou: as fontes e a chave. Não achou: found false, com a hora da
// consulta. Indisponível: found false sem hora, porque ninguém respondeu.
export function externalMetadataOf(
  lookup: BookMetadataLookup,
  at: Date,
): ExternalMetadataInfo {
  switch (lookup.status) {
    case LOOKUP_STATUS.found:
      return {
        sources: lookup.sources,
        ...(lookup.openLibraryKey
          ? { openLibraryKey: lookup.openLibraryKey }
          : {}),
        lastSyncedAt: at,
        found: true,
      }
    case LOOKUP_STATUS.notFound:
      return { sources: [], lastSyncedAt: at, found: false }
    case LOOKUP_STATUS.unavailable:
      return { sources: [], lastSyncedAt: null, found: false }
  }
}

// O que gravar no livro depois de combinar o salvo com a resposta das fontes.
export interface MetadataSyncUpdate {
  // Só os campos que mudam, mais externalMetadata, searchText, dataSource e
  // updatedAt.
  update: Partial<Book>
  // Os campos de conteúdo que mudaram, para o app mostrar (sem externalMetadata).
  changedFields: MetadataSyncField[]
}

// Combina os dados salvos do livro com a resposta das fontes externas (RF-GAC-04,
// RF-ACE-04). Troca SOMENTE title, subtitle, authors, publisher, year, synopsis,
// coverUrl, subjects e externalMetadata; nunca cdu, cutter, shelf, location,
// idioma, exemplares, contadores, workId nem status. Campo que as fontes não
// trouxeram não apaga o valor salvo. ISBN que nenhuma fonte achou só atualiza
// externalMetadata (found false). `at` é o horário real da atualização.
export function applyMetadataLookup(
  saved: Book,
  lookup: Exclude<
    BookMetadataLookup,
    { status: typeof LOOKUP_STATUS.unavailable }
  >,
  at: Date,
): MetadataSyncUpdate {
  if (lookup.status === LOOKUP_STATUS.notFound) {
    return {
      update: {
        externalMetadata: externalMetadataOf(lookup, at),
        updatedAt: at,
      },
      changedFields: [],
    }
  }

  const changes: Partial<Pick<Book, MetadataSyncField>> = {}
  const changedFields: MetadataSyncField[] = []
  for (const field of METADATA_SYNC_FIELDS) {
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
      externalMetadata: externalMetadataOf(lookup, at),
      searchText: buildSearchText(merged),
      dataSource: dataSourceAfterSync(lookup.data),
      updatedAt: at,
    },
    changedFields,
  }
}
