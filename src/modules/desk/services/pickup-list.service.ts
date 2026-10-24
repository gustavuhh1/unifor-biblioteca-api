import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import { PICKUP_LIST_LIMIT } from '../desk.constants.js'
import type { PickupsQuery, PickupsResponse } from '../desk.types.js'
import { filterByMatricula, toPickupItem } from '../rules/pickup-list.rules.js'

// Retiradas (RF-BAL-05): os pedidos aguardando retirada, do prazo mais curto ao
// mais longo, com busca opcional pelos primeiros dígitos da matrícula. A busca é
// feita aqui, e não no banco, para funcionar enquanto o bibliotecário digita. Só
// leitura.
export async function listPickups(
  query: PickupsQuery,
): Promise<PickupsResponse> {
  const loans = await loansRepository.listAwaitingPickup(PICKUP_LIST_LIMIT)
  return {
    items: filterByMatricula(loans, query.matricula).map(toPickupItem),
  }
}
