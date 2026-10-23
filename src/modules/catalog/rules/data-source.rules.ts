import { DATA_SOURCE, type DataSource } from '../../../shared/types/index.js'
import {
  DATA_SOURCE_FIELDS,
  METADATA_SYNC_FIELDS,
} from '../catalog.constants.js'
import type { BookMetadata } from '../catalog.types.js'
import { sameValue } from './same-value.rules.js'

// Os campos do cadastro que dão a origem dos dados.
type DataSourceInput = Pick<BookMetadata, (typeof DATA_SOURCE_FIELDS)[number]>

// Origem dos dados depois de atualizar pelas fontes externas (RF-GAC-04). A
// atualização só preenche campo vazio, então: se nada foi preenchido, a origem
// continua a mesma; se algo foi preenchido num livro manual, vira mixed (dado
// local mais dado externo); external e mixed continuam como estão.
export function dataSourceAfterSync(
  current: DataSource,
  filledFields: readonly string[],
): DataSource {
  return filledFields.length > 0 && current === DATA_SOURCE.manual
    ? DATA_SOURCE.mixed
    : current
}

// Origem dos dados de um livro novo (books.dataSource, RF-GAC-02):
//   manual    nenhuma fonte externa achou o ISBN (ou o livro não tem ISBN, ou as
//             fontes não responderam);
//   external  as fontes acharam e título, autores, editora e sinopse estão como
//             elas os mandaram (nada foi alterado à mão);
//   mixed     as fontes acharam, mas algum desses campos foi alterado à mão.
// `external` são os dados combinados das fontes agora, ou undefined se nada foi
// achado. Campo que as fontes não trouxeram e continua vazio conta como igual.
export function dataSourceForNewBook(input: {
  external: BookMetadata | undefined
  book: DataSourceInput
}): DataSource {
  const { external, book } = input
  if (!external) return DATA_SOURCE.manual
  return DATA_SOURCE_FIELDS.every((field) =>
    sameValue(book[field], external[field]),
  )
    ? DATA_SOURCE.external
    : DATA_SOURCE.mixed
}

// Origem dos dados depois de uma edição (RF-GAC-03): um livro external vira mixed
// quando algum campo de origem externa muda; manual continua manual e mixed
// continua mixed.
export function dataSourceAfterEdit(
  current: DataSource,
  changedFields: readonly string[],
): DataSource {
  const touchedExternalField = changedFields.some((field) =>
    (METADATA_SYNC_FIELDS as readonly string[]).includes(field),
  )
  return current === DATA_SOURCE.external && touchedExternalField
    ? DATA_SOURCE.mixed
    : current
}
