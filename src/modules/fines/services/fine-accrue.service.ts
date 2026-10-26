import { getDb } from '../../../config/firebase.js'
import { lateBusinessDays } from '../../../shared/calendar/business-days.js'
import { readLibraryCalendar } from '../../../shared/firestore/calendar.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import * as loansRepository from '../../../shared/repositories/loans.repository.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import { LOAN_STATUS } from '../../../shared/types/index.js'
import * as finesRepository from '../repositories/fines.repository.js'
import { buildAccruingFine, fineStudentOf } from '../rules/fine-amount.rules.js'

// Começa a contar a multa (RF-MUL-01, rotina `accrue_fines`). QUEM CHAMA: a rota do
// Cloud Scheduler do módulo `jobs`, uma vez por dia, passando o "agora" das regras
// de negócio (shared/clock). Cada empréstimo ativo que já tem pelo menos um dia útil
// de atraso e ainda não tem multa ganha uma multa `accruing`, ligada a ele por
// `loans.fineId`, numa transação própria que confere o empréstimo de novo. A
// devolução congela essa multa (fine-freeze.service); se a devolução vier antes
// da rotina, a multa nasce lá, já congelada. Rodar a rotina de novo não cria
// uma segunda multa. Devolve quantas multas começaram a contar.
export async function accrueFines(at: Date): Promise<number> {
  const settings = await readLoanSettings()
  const calendar = await readLibraryCalendar(settings.openingHours, at)
  const overdue = await loansRepository.listActiveDueBefore(at)
  let created = 0

  for (const candidate of overdue) {
    if (candidate.fineId || !candidate.dueAt) continue
    if (lateBusinessDays(candidate.dueAt, at, calendar.closedDates) < 1)
      continue

    const done = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(candidate.id, tx)
      if (!loan || loan.status !== LOAN_STATUS.active) return false
      if (loan.fineId || !loan.dueAt) return false

      const student = await usersRepository.findById(loan.studentUid, tx)
      if (!student) throw new Error('Aluno do empréstimo não encontrado.')

      const fineId = finesRepository.newFineId()
      finesRepository.create(
        tx,
        fineId,
        buildAccruingFine({
          loan: { ...loan, dueAt: loan.dueAt },
          student: fineStudentOf(student),
          ratePerBusinessDayCents: settings.fineCentsPerBusinessDay,
          at,
        }),
      )
      loansRepository.update(tx, loan.id, { fineId, updatedAt: at })
      return true
    })
    if (done) created++
  }
  return created
}
