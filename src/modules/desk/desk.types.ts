import type { FineStatus, LoanStatus } from '../../shared/types/index.js'

export interface DeskLoanItem {
  id: string
  bookId: string
  copyId: string
  bookTitle: string
  bookShelf: string
  status: LoanStatus
  pickupCode: string | null
  pickupDeadline: string
  pickedUpAt: string | null
  dueAt: string | null
}

export interface PickupItem extends DeskLoanItem {
  studentUid: string
  matricula: string
  studentName: string
}

export interface DeskFineSummary {
  id: string
  status: FineStatus
  businessDaysLate: number
  amountCents: number
}
