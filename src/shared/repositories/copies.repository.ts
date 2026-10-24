import {
  FieldValue,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore'
import { getDb } from '../../config/firebase.js'
import { COLLECTIONS } from '../firestore/collections.js'
import { dataWithDates, withoutUndefined } from '../firestore/converters.js'
import { readDocument } from '../firestore/read.js'
import { COPY_STATUS, type Copy, type CopyRecord } from '../types/index.js'

// Acesso ao Firestore da coleção copies (seção 2.8). Toda função que grava
// recebe tx e deve ser chamada depois de todas as leituras da transação.

const copies = () => getDb().collection(COLLECTIONS.copies)

// Campos de data do documento que o Firestore devolve como Timestamp.
const COPY_DATE_FIELDS = ['createdAt', 'updatedAt', 'dueAt'] as const

// Converte o documento lido em CopyRecord (com o id), trocando os Timestamps por
// Date.
function toRecord(snapshot: DocumentSnapshot): CopyRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, COPY_DATE_FIELDS),
  } as unknown as CopyRecord
}

// Gera o id de um exemplar novo, sem gravar nada.
export function newCopyId(): string {
  return copies().doc().id
}

// Lê os exemplares de um livro. Com tx, a leitura entra na transação.
export async function listByBook(
  bookId: string,
  tx?: Transaction,
): Promise<CopyRecord[]> {
  const query = copies().where('bookId', '==', bookId)
  const result = await (tx ? tx.get(query) : query.get())
  return result.docs.map(toRecord)
}

// Diz quais destes registros já existem no acervo (o registro é único, RF-GAC-02).
export async function findTakenRegistrations(
  tx: Transaction,
  registrations: readonly string[],
): Promise<Set<string>> {
  const taken = new Set<string>()
  const results = await Promise.all(
    [...new Set(registrations)].map((registration) =>
      tx.get(copies().where('registration', '==', registration).limit(1)),
    ),
  )
  for (const result of results) {
    for (const doc of result.docs) taken.add(doc.get('registration') as string)
  }
  return taken
}

// Grava um exemplar novo (cadastro, RF-GAC-02).
export function create(tx: Transaction, id: string, copy: Copy): void {
  tx.set(copies().doc(id), withoutUndefined(copy))
}

// Tira os exemplares do acervo (remoção do livro, RF-GAC-05): status withdrawn.
export function withdraw(
  tx: Transaction,
  ids: readonly string[],
  at: Date,
): void {
  for (const id of ids) {
    tx.update(copies().doc(id), {
      status: COPY_STATUS.withdrawn,
      updatedAt: at,
    })
  }
}

// Lê um exemplar. Com tx, a leitura entra na transação. Não devolve nada se ele
// não existir.
export async function findById(
  id: string,
  tx?: Transaction,
): Promise<CopyRecord | undefined> {
  const snapshot = await readDocument(copies().doc(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Lê um exemplar disponível do livro (status available), se houver (RF-EMP-01).
export async function findAvailableByBook(
  bookId: string,
  tx: Transaction,
): Promise<CopyRecord | undefined> {
  const result = await tx.get(
    copies()
      .where('bookId', '==', bookId)
      .where('status', '==', COPY_STATUS.available)
      .limit(1),
  )
  const [doc] = result.docs
  return doc ? toRecord(doc) : undefined
}

// Separa o exemplar para um pedido: reserved, ligado ao empréstimo (RF-EMP-01).
// Se o exemplar estava guardado para a vez de alguém da fila, a reserva da fila
// termina aqui (RF-FIL-06).
export function reserve(
  tx: Transaction,
  id: string,
  loanId: string,
  at: Date,
): void {
  tx.update(copies().doc(id), {
    status: COPY_STATUS.reserved,
    currentLoanId: loanId,
    reservedForQueueEntryId: FieldValue.delete(),
    updatedAt: at,
  })
}

// Guarda o exemplar para a vez do 1º da fila: reserved, ligado ao lugar dele na
// fila, sem empréstimo nem vencimento (RF-FIL-06).
export function reserveForQueue(
  tx: Transaction,
  id: string,
  queueEntryId: string,
  at: Date,
): void {
  tx.update(copies().doc(id), {
    status: COPY_STATUS.reserved,
    reservedForQueueEntryId: queueEntryId,
    currentLoanId: FieldValue.delete(),
    dueAt: FieldValue.delete(),
    updatedAt: at,
  })
}

// Devolve o exemplar à estante: available, sem empréstimo, reserva nem vencimento
// (cancelamento do pedido, RF-EMP-05).
export function makeAvailable(tx: Transaction, id: string, at: Date): void {
  tx.update(copies().doc(id), {
    status: COPY_STATUS.available,
    currentLoanId: FieldValue.delete(),
    reservedForQueueEntryId: FieldValue.delete(),
    dueAt: FieldValue.delete(),
    updatedAt: at,
  })
}

// Registra a retirada no exemplar: de reserved (separado no pedido) para on_loan,
// com o vencimento. O empréstimo ligado (currentLoanId) continua o mesmo
// (RF-BAL-02).
export function markOnLoan(
  tx: Transaction,
  id: string,
  dueAt: Date,
  at: Date,
): void {
  tx.update(copies().doc(id), {
    status: COPY_STATUS.onLoan,
    dueAt,
    updatedAt: at,
  })
}

// Grava o vencimento no exemplar emprestado (renovação, RF-EMP-09).
export function setDueAt(
  tx: Transaction,
  id: string,
  dueAt: Date,
  at: Date,
): void {
  tx.update(copies().doc(id), { dueAt, updatedAt: at })
}
