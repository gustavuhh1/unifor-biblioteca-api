import { DATA_SOURCE, type DataSource } from '../../../shared/types/index.js'
import { DATA_SOURCE_FIELDS, GOOGLE_SYNC_FIELDS } from '../catalog.constants.js'
import type { GoogleBookData } from '../catalog.types.js'
import { sameValue } from './same-value.rules.js'

// Os campos do cadastro que dão a origem dos dados.
type DataSourceInput = Pick<GoogleBookData, (typeof DATA_SOURCE_FIELDS)[number]>

// Origem dos dados depois de atualizar pelo Google Books (RF-GAC-04):
// google_books se o Google trouxe título, autores, editora e sinopse; senão mixed.
export function dataSourceAfterSync(data: GoogleBookData): DataSource {
  return DATA_SOURCE_FIELDS.every((field) => data[field] !== undefined)
    ? DATA_SOURCE.googleBooks
    : DATA_SOURCE.mixed
}

// Origem dos dados de um livro novo (books.dataSource, RF-GAC-02):
//   manual        nada veio do Google Books (sem volumeId);
//   google_books  veio do Google e título, autores, editora e sinopse estão como
//                 o Google os mandou (nada foi alterado à mão);
//   mixed         nos demais casos, inclusive quando o volume não pôde ser
//                 conferido no Google.
// `volume` é o volume do Google conferido agora, ou undefined se a conferência
// falhou. Campo que o Google não trouxe e continua vazio conta como igual.
export function dataSourceForNewBook(input: {
  hasVolumeId: boolean
  volume: GoogleBookData | undefined
  book: DataSourceInput
}): DataSource {
  if (!input.hasVolumeId) return DATA_SOURCE.manual
  const { volume, book } = input
  if (!volume) return DATA_SOURCE.mixed
  return DATA_SOURCE_FIELDS.every((field) =>
    sameValue(book[field], volume[field]),
  )
    ? DATA_SOURCE.googleBooks
    : DATA_SOURCE.mixed
}

// Origem dos dados depois de uma edição (RF-GAC-03): um livro google_books vira
// mixed quando algum campo de origem Google muda; manual continua manual e mixed
// continua mixed.
export function dataSourceAfterEdit(
  current: DataSource,
  changedFields: readonly string[],
): DataSource {
  const touchedGoogleField = changedFields.some((field) =>
    (GOOGLE_SYNC_FIELDS as readonly string[]).includes(field),
  )
  return current === DATA_SOURCE.googleBooks && touchedGoogleField
    ? DATA_SOURCE.mixed
    : current
}
