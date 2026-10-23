import { nowOf } from '../../../shared/clock.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import type {
  LibrarianFinesQuery,
  LibrarianFinesResponse,
} from '../fines.types.js'
import * as finesRepository from '../repositories/fines.repository.js'
import {
  matchesFineSearch,
  toLibrarianFineResponse,
} from '../rules/fine-view.rules.js'

// Aba Multas do bibliotecário (RF-BAL-09): as multas da aba pedida (Em aberto,
// Contando ou Pagas), com busca opcional por nome ou matrícula. Na aba Contando, os
// dias úteis e o valor são calculados na hora, até o "agora" das regras de
// negócio. A ordem de cada aba é a do repositório; não há outros filtros.
export async function listLibrarianFines(
  query: LibrarianFinesQuery,
): Promise<LibrarianFinesResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const [calendar, fines] = await Promise.all([
    readLibraryCalendar(settings.openingHours, at),
    finesRepository.listByStatus(query.status),
  ])
  return {
    status: query.status,
    items: fines
      .filter((fine) => matchesFineSearch(fine, query.q))
      .map((fine) => toLibrarianFineResponse(fine, at, calendar.closedDates)),
  }
}
