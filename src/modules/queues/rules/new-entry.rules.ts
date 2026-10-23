import {
  QUEUE_ENTRY_STATUS,
  type BookRecord,
  type QueueEntry,
  type QueueOrigin,
} from '../../../shared/types/index.js'

// O que o lugar novo copia do aluno e da edição (seção 2.10).
export interface NewQueueEntryInput {
  book: Pick<BookRecord, 'id' | 'workId' | 'title'>
  student: { uid: string; matricula: string; name: string }
  // Define a ordem na fila (menor = na frente).
  order: number
  origin: QueueOrigin
  // Igual nas edições marcadas juntas (RF-FIL-04).
  editionGroupId?: string | undefined
  // Quando o bibliotecário coloca o aluno na fila (RF-BAL-06).
  addedBy?: string | undefined
  addReason?: string | undefined
  // Quando o aluno entrou; também é createdAt e updatedAt.
  at: Date
}

// Monta o documento queueEntries de quem entra na fila (RF-FIL-02, RF-BAL-06): na
// espera (`waiting`), sem vez, prazo nem aviso ainda.
export function buildNewEntry(input: NewQueueEntryInput): QueueEntry {
  const { book, student, at } = input
  return {
    bookId: book.id,
    workId: book.workId,
    bookTitle: book.title,
    studentUid: student.uid,
    matricula: student.matricula,
    studentName: student.name,
    status: QUEUE_ENTRY_STATUS.waiting,
    order: input.order,
    joinedAt: at,
    ...(input.editionGroupId ? { editionGroupId: input.editionGroupId } : {}),
    origin: input.origin,
    ...(input.addedBy ? { addedBy: input.addedBy } : {}),
    ...(input.addReason ? { addReason: input.addReason } : {}),
    notifyCount: 0,
    createdAt: at,
    updatedAt: at,
  }
}
