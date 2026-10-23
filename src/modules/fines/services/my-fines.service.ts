import { nowOf } from '../../../shared/clock.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import { hasOverdueLoan } from '../../../shared/rules/request-eligibility.js'
import { readStudentCirculation } from '../../catalog/repositories/student-circulation.repository.js'
import type { MyFinesResponse } from '../fines.types.js'
import * as finesRepository from '../repositories/fines.repository.js'
import { openTotalCentsOf, toFineResponse } from '../rules/fine-view.rules.js'

// Minhas multas (RF-MUL-03, RF-MUL-04): o valor, os dias úteis de atraso e o livro
// de cada multa do aluno, as de vencimento mais recente primeiro. Na multa
// `accruing` os dias e o valor são calculados na hora; nas outras, são os valores
// congelados. Não existe rota de pagamento para o aluno: o app só consulta.
// `openTotalCents` soma as multas em aberto (o aviso), e `blocksNewLoans` só é true
// com empréstimo atrasado: multa em aberto sem atraso só avisa e não bloqueia
// pedido nem fila.
export async function listMyFines(uid: string): Promise<MyFinesResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const [calendar, fines, circulation] = await Promise.all([
    readLibraryCalendar(settings.openingHours, at),
    finesRepository.listByStudent(uid),
    readStudentCirculation(uid),
  ])
  const items = fines.map((fine) =>
    toFineResponse(fine, at, calendar.closedDates),
  )
  return {
    items,
    openTotalCents: openTotalCentsOf(items),
    blocksNewLoans: hasOverdueLoan(circulation, at),
  }
}
