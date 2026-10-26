import { getDb } from '../../../config/firebase.js'
import { readLibraryCalendarBetween } from '../../../shared/firestore/calendar.js'
import type { LoanSettings } from '../../../shared/firestore/settings.js'
import { LOAN_STATUS } from '../../../shared/types/index.js'
import * as usersRepository from '../../auth/repositories/users.repository.js'
import * as finesRepository from '../../fines/repositories/fines.repository.js'
import {
  buildAccruingFine,
  calculateFine,
  fineStudentOf,
} from '../../fines/rules/fine-amount.rules.js'
import * as loansRepository from '../../loans/repositories/loans.repository.js'

export async function accrueFines(at: Date, settings: LoanSettings) {
  const fineIds: string[] = []
  for (const loanId of await loansRepository.listActiveIdsDueBefore(at)) {
    const before = await loansRepository.findById(loanId)
    if (!before?.dueAt || before.fineId) continue
    const calendar = await readLibraryCalendarBetween(
      settings.openingHours,
      before.dueAt,
      at,
    )
    if (
      calculateFine({
        dueAt: before.dueAt,
        until: at,
        ratePerBusinessDayCents: settings.fineCentsPerBusinessDay,
        closedDates: calendar.closedDates,
      }).businessDaysLate === 0
    ) {
      continue
    }

    const created = await getDb().runTransaction(async (tx) => {
      const loan = await loansRepository.findById(loanId, tx)
      if (
        !loan?.dueAt ||
        loan.status !== LOAN_STATUS.active ||
        loan.fineId ||
        loan.dueAt.getTime() >= at.getTime()
      ) {
        return undefined
      }
      const student = await usersRepository.findById(loan.studentUid, tx)
      if (!student)
        throw new Error(`Aluno do empréstimo ${loan.id} não encontrado.`)
      const fineId = finesRepository.newFineId()
      const fine = buildAccruingFine({
        loan: { ...loan, dueAt: loan.dueAt },
        student: fineStudentOf(student),
        ratePerBusinessDayCents: settings.fineCentsPerBusinessDay,
        at,
      })
      finesRepository.create(tx, fineId, fine)
      loansRepository.update(tx, loan.id, { fineId, updatedAt: at })
      return fineId
    })
    if (created) fineIds.push(created)
  }
  return { processed: fineIds.length, fineIds }
}
