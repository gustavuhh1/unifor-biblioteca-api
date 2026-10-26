import { isoOrNull } from '../../../shared/iso-date.js'
import { LOAN_STATUS, type LoanRecord } from '../../../shared/types/index.js'
import type { DeskLoanItem, PickupItem } from '../desk.types.js'

export function toDeskLoan(loan: LoanRecord): DeskLoanItem {
  return {
    id: loan.id,
    bookId: loan.bookId,
    copyId: loan.copyId,
    bookTitle: loan.bookTitle,
    bookShelf: loan.bookShelf,
    status: loan.status,
    pickupCode:
      loan.status === LOAN_STATUS.awaitingPickup ? loan.pickupCode : null,
    pickupDeadline: loan.pickupDeadline.toISOString(),
    pickedUpAt: isoOrNull(loan.pickedUpAt),
    dueAt: isoOrNull(loan.dueAt),
  }
}

export function toPickupItem(loan: LoanRecord): PickupItem {
  return {
    ...toDeskLoan(loan),
    studentUid: loan.studentUid,
    matricula: loan.matricula,
    studentName: loan.studentName,
  }
}
