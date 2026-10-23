import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  optionalDate,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import {
  LOAN_STATUS,
  type Loan,
  type LoanRecord,
} from '../../../shared/types/index.js'
import { LOAN_LIST_LIMIT } from '../loans.constants.js'

// Acesso ao Firestore da coleção loans (seção 2.9). Toda função que grava recebe tx
// e deve ser chamada depois de todas as leituras da transação.

const loans = () => getDb().collection(COLLECTIONS.loans)

// Campos de data do documento que o Firestore devolve como Timestamp.
const LOAN_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'requestedAt',
  'pickupDeadline',
  'pickedUpAt',
  'dueAt',
  'originalDueAt',
  'renewedAt',
  'returnedAt',
  'cancelledAt',
  'expiredAt',
] as const

// Datas dos lembretes enviados (loans.remindersSent).
const REMINDER_FIELDS = ['due2Days', 'dueDay', 'overdue'] as const

// Converte o documento lido em LoanRecord (com o id), trocando os Timestamps por
// Date, inclusive os de remindersSent.
function toRecord(snapshot: DocumentSnapshot): LoanRecord {
  const data = dataWithDates(snapshot, LOAN_DATE_FIELDS)
  const reminders = (data.remindersSent ?? {}) as Record<string, unknown>
  const remindersSent = Object.fromEntries(
    REMINDER_FIELDS.flatMap((field) => {
      const date = optionalDate(reminders[field])
      return date ? [[field, date]] : []
    }),
  )
  return { id: snapshot.id, ...data, remindersSent } as unknown as LoanRecord
}

// Gera o id de um pedido novo, sem gravar nada.
export function newLoanId(): string {
  return loans().doc().id
}

// Lê um pedido ou empréstimo. Com tx, a leitura entra na transação. Não devolve
// nada se ele não existir.
export async function findById(
  id: string,
  tx?: Transaction,
): Promise<LoanRecord | undefined> {
  const snapshot = await readDocument(loans().doc(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// Os códigos de retirada ("RET-4821") dos pedidos aguardando retirada: o código só
// precisa ser único entre eles (seção 2.9). Lido na transação do pedido.
export async function listAwaitingPickupCodes(
  tx: Transaction,
): Promise<Set<string>> {
  const result = await tx.get(
    loans().where('status', '==', LOAN_STATUS.awaitingPickup),
  )
  return new Set(result.docs.map((doc) => doc.get('pickupCode') as string))
}

// Os pedidos e empréstimos do aluno, dos mais novos para os mais antigos (índice
// studentUid + requestedAt), até LOAN_LIST_LIMIT.
export async function listByStudent(uid: string): Promise<LoanRecord[]> {
  const result = await loans()
    .where('studentUid', '==', uid)
    .orderBy('requestedAt', 'desc')
    .limit(LOAN_LIST_LIMIT)
    .get()
  return result.docs.map(toRecord)
}

// Grava um pedido novo (RF-EMP-01).
export function create(tx: Transaction, id: string, loan: Loan): void {
  tx.set(loans().doc(id), withoutUndefined(loan))
}

// Atualiza campos de um pedido ou empréstimo (cancelamento, renovação).
export function update(
  tx: Transaction,
  id: string,
  fields: Partial<Loan>,
): void {
  tx.update(loans().doc(id), withoutUndefined(fields))
}
