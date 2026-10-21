import { buildSearchText } from '../../../shared/search-text.js'
import type { Book } from '../../../shared/types/index.js'
import type { UpdateBookBody } from '../catalog.types.js'
import { dataSourceAfterEdit } from './data-source.rules.js'
import { sameValue } from './same-value.rules.js'

// Marca de "apagar o campo" no que vai para o banco: o repositório a troca pelo
// apagar do Firestore.
export const DELETE_FIELD = Symbol('delete-field')

// O que gravar no livro depois de uma edição.
export interface BookUpdate {
  // Campos a gravar: valores novos ou DELETE_FIELD. Vazio se nada mudou.
  update: Record<string, unknown>
  // Campos de conteúdo que mudaram (sem a marca de indisponível).
  changedFields: string[]
  // A marca "indisponível para novos pedidos" mudou.
  unavailableChanged: boolean
}

// Valor guardado quando o campo é apagado: a capa vira null (o app gera a capa);
// os demais campos opcionais deixam de existir.
const clearedValue = (field: string) =>
  field === 'coverUrl' ? null : DELETE_FIELD

// Calcula a edição de um livro (RF-GAC-03, RF-GAC-06): só entra o que mudou de
// verdade. Refaz o texto de busca, ajusta a origem dos dados e, ao marcar ou
// desmarcar "indisponível para novos pedidos", grava ou limpa quem e quando.
// `at` é o horário real da edição.
export function applyBookUpdate(
  book: Book,
  patch: UpdateBookBody,
  actorUid: string,
  at: Date,
): BookUpdate {
  const update: Record<string, unknown> = {}
  const changedFields: string[] = []
  let unavailableChanged = false

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue

    if (field === 'unavailableForNewRequests') {
      if (value === book.unavailableForNewRequests) continue
      unavailableChanged = true
      update.unavailableForNewRequests = value
      update.unavailableSetAt = value ? at : DELETE_FIELD
      update.unavailableSetBy = value ? actorUid : DELETE_FIELD
      continue
    }

    const current = (book as unknown as Record<string, unknown>)[field]
    const changed =
      value === null
        ? current !== undefined && current !== null
        : !sameValue(current, value)
    if (!changed) continue
    update[field] = value === null ? clearedValue(field) : value
    changedFields.push(field)
  }

  if (changedFields.length === 0 && !unavailableChanged) {
    return { update: {}, changedFields, unavailableChanged }
  }

  const next = applyToBook(book, update)
  const searchText = buildSearchText(next)
  if (searchText !== book.searchText) update.searchText = searchText
  const dataSource = dataSourceAfterEdit(book.dataSource, changedFields)
  if (dataSource !== book.dataSource) update.dataSource = dataSource
  update.updatedAt = at

  return { update, changedFields, unavailableChanged }
}

// O livro como ficará depois de gravar `update` (valores novos e campos apagados).
export function applyToBook<T extends Book>(
  book: T,
  update: Record<string, unknown>,
): T {
  const next = { ...book } as Record<string, unknown>
  for (const [field, value] of Object.entries(update)) {
    if (value === DELETE_FIELD) delete next[field]
    else next[field] = value
  }
  return next as unknown as T
}
