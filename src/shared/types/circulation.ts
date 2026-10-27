import type {
  Cents,
  FineStatus,
  LoanOrigin,
  LoanStatus,
  QueueEntryStatus,
  QueueOrigin,
  Timestamps,
} from './enums.js'

// Documentos da circulação (docs/modelo-de-dados-firestore.md, seções 2.9 a 2.11).

// Lembretes já enviados, para não repetir.
export interface RemindersSent {
  due2Days?: Date
  dueDay?: Date
  overdue?: Date
}

// loans/{loanId}: pedido e empréstimo, do pedido à devolução.
export interface Loan extends Timestamps {
  studentUid: string
  // Cópias do aluno e do livro, para listas e busca no balcão.
  matricula: string
  studentName: string
  bookId: string
  workId: string
  copyId: string
  bookTitle: string
  bookShelf: string
  status: LoanStatus
  origin: LoanOrigin
  queueEntryId?: string
  // Código curto "RET-4821", digitado no balcão sem QR.
  pickupCode: string
  // Segredo aleatório (pelo menos 128 bits, base64url) que vai no QR.
  qrToken: string
  requestedAt: Date
  pickupDeadline: Date
  pickedUpAt?: Date
  pickedUpBy?: string
  loanDays: number
  dueAt?: Date
  // Vencimento antes da renovação.
  originalDueAt?: Date
  // 0 ou 1: só uma renovação.
  renewalCount: number
  renewedAt?: Date
  returnedAt?: Date
  returnedTo?: string
  cancelledAt?: Date
  expiredAt?: Date
  fineId?: string
  remindersSent: RemindersSent
}

// queueEntries/{entryId}: um lugar de um aluno na fila de uma edição.
export interface QueueEntry extends Timestamps {
  bookId: string
  workId: string
  bookTitle: string
  studentUid: string
  matricula: string
  studentName: string
  status: QueueEntryStatus
  // Menor = na frente. Entrada normal: maior order atual + 1000.
  order: number
  joinedAt: Date
  // Mesmo valor nas edições marcadas juntas.
  editionGroupId?: string
  origin: QueueOrigin
  addedBy?: string
  addReason?: string
  turnStartedAt?: Date
  // turnStartedAt + 24 horas corridas.
  confirmDeadline?: Date
  reservedCopyId?: string
  loanId?: string
  lastNotifiedAt?: Date
  notifyCount: number
  endedAt?: Date
  endReason?: string
  endedBy?: string
}

// fines/{fineId}: multa por atraso de um empréstimo.
export interface Fine extends Timestamps {
  loanId: string
  studentUid: string
  matricula: string
  studentName: string
  studentNameNormalized: string
  bookId: string
  bookTitle: string
  status: FineStatus
  // Copiado de settings/library na criação.
  ratePerBusinessDayCents: Cents
  // Cópia do vencimento do empréstimo.
  dueAt: Date
  // Gravados ao congelar (open).
  businessDaysLate?: number
  amountCents?: Cents
  frozenAt?: Date
  paidAt?: Date
  receivedBy?: string
  receivedByName?: string
  // true quando marcado "Multa paga agora" na devolução.
  paidAtReturn?: boolean
}

// Pedido ou empréstimo lido do banco, com o seu id (o id do documento).
export type LoanRecord = Loan & { id: string }

// Lugar na fila lido do banco, com o seu id.
export type QueueEntryRecord = QueueEntry & { id: string }

// Multa lida do banco, com o seu id.
export type FineRecord = Fine & { id: string }

// Histórico usado nas sugestões: livros devolvidos e obras já emprestadas.
export interface ReadingHistory {
  returnedBookIds: string[]
  borrowedWorkIds: Set<string>
}
