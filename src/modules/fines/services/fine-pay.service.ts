import { getDb } from '../../../config/firebase.js'
import { writeAuditLog } from '../../../shared/audit-log.js'
import { nowOf } from '../../../shared/clock.js'
import { readLoanSettings } from '../../../shared/firestore/settings.js'
import {
  AUDIT_ACTION,
  AUDIT_ACTOR_ROLE,
  FINE_STATUS,
} from '../../../shared/types/index.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import {
  fineAlreadyPaid,
  fineNotFound,
  fineNotPayable,
} from '../fines.errors.js'
import type { LibrarianFineResponse } from '../fines.types.js'
import * as finesRepository from '../repositories/fines.repository.js'
import {
  fineReceiverOf,
  payDenialOf,
  payFields,
} from '../rules/fine-amount.rules.js'
import { toLibrarianFineResponse } from '../rules/fine-view.rules.js'

// O bibliotecário registra o pagamento de uma multa em aberto (RF-BAL-09). O
// pagamento é feito no balcão: o app não paga, e esta rota é só do bibliotecário.
// Só vale para multa `open`: contando (`accruing`) é fine_not_payable e já paga é
// fine_already_paid. Numa transação: a multa vira `paid` (`paidAt`, `receivedBy`,
// `receivedByName`), o `openFineTotalCents` do aluno cai o valor da multa e o
// auditLog registra `fine_paid`.
export async function payFine(
  librarianUid: string,
  fineId: string,
): Promise<LibrarianFineResponse> {
  const settings = await readLoanSettings()
  const at = nowOf(settings)

  const paid = await getDb().runTransaction(async (tx) => {
    const fine = await finesRepository.findById(fineId, tx)
    if (!fine) throw fineNotFound()
    const denial = payDenialOf(fine)
    if (denial === FINE_STATUS.accruing) throw fineNotPayable()
    if (denial === FINE_STATUS.paid) throw fineAlreadyPaid()

    const [librarian, student] = await Promise.all([
      usersRepository.findById(librarianUid, tx),
      usersRepository.findById(fine.studentUid, tx),
    ])
    if (!librarian) throw new Error('Bibliotecário da sessão não encontrado.')
    if (!student) throw new Error('Aluno da multa não encontrado.')

    const fields = payFields(fineReceiverOf(librarianUid, librarian), at)
    const amountCents = fine.amountCents ?? 0
    finesRepository.update(tx, fine.id, fields)
    usersRepository.setOpenFineTotalCents(
      tx,
      fine.studentUid,
      Math.max(0, student.openFineTotalCents - amountCents),
      at,
    )
    writeAuditLog(
      tx,
      {
        actorUid: librarianUid,
        actorRole: AUDIT_ACTOR_ROLE.librarian,
        action: AUDIT_ACTION.finePaid,
        targetUid: fine.studentUid,
        bookId: fine.bookId,
        entityId: fine.id,
        details: { amountCents, loanId: fine.loanId },
      },
      at,
    )
    return { ...fine, ...fields }
  })

  // A multa paga mostra os valores congelados: o calendário não entra na conta.
  return toLibrarianFineResponse(paid, at, new Set())
}
