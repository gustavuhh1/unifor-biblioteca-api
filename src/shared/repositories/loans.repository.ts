import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../config/firebase.js'
import { COLLECTIONS } from '../firestore/collections.js'
import {
  dataWithDates,
  optionalDate,
  withoutUndefined,
} from '../firestore/converters.js'
import { readDocument } from '../firestore/read.js'
import { LOAN_STATUS, type Loan, type LoanRecord } from '../types/index.js'

// Acesso ao Firestore da coleção loans (seção 2.9). Toda função que grava recebe tx
// e deve ser chamada depois de todas as leituras da transação.

// Quantos pedidos e empréstimos Meus empréstimos devolve por consulta.
export const LOAN_LIST_LIMIT = 200

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

// Acha o pedido pelo segredo do QR (RF-BAL-02). O QR é lido no balcão e só vale
// para o pedido de que saiu; o segredo é único. Não devolve nada se não existir.
export async function findByQrToken(
  qrToken: string,
): Promise<LoanRecord | undefined> {
  const result = await loans().where('qrToken', '==', qrToken).limit(1).get()
  const [doc] = result.docs
  return doc ? toRecord(doc) : undefined
}

// Acha o pedido aguardando retirada pelo código curto "RET-4821" (RF-BAL-03). O
// código só é único entre os pedidos aguardando retirada (seção 2.9).
export async function findAwaitingByPickupCode(
  pickupCode: string,
): Promise<LoanRecord | undefined> {
  const result = await loans()
    .where('pickupCode', '==', pickupCode)
    .where('status', '==', LOAN_STATUS.awaitingPickup)
    .limit(1)
    .get()
  const [doc] = result.docs
  return doc ? toRecord(doc) : undefined
}

// Os pedidos aguardando retirada, do prazo mais curto ao mais longo (lista
// Retiradas, RF-BAL-05; índice status + pickupDeadline), até `limit`.
export async function listAwaitingPickup(limit: number): Promise<LoanRecord[]> {
  const result = await loans()
    .where('status', '==', LOAN_STATUS.awaitingPickup)
    .orderBy('pickupDeadline', 'asc')
    .limit(limit)
    .get()
  return result.docs.map(toRecord)
}

// Quantos pedidos aguardam retirada (Painel, RF-BAL-01).
export async function countAwaitingPickup(): Promise<number> {
  const result = await loans()
    .where('status', '==', LOAN_STATUS.awaitingPickup)
    .count()
    .get()
  return result.data().count
}

// Os pedidos aguardando retirada cujo prazo venceu antes de `at` (rotina
// `expire_pickups`, RF-EMP-06; índice status + pickupDeadline). Quem chama confere
// cada um de novo dentro da própria transação.
export async function listAwaitingPickupExpiredBefore(
  at: Date,
): Promise<LoanRecord[]> {
  const result = await loans()
    .where('status', '==', LOAN_STATUS.awaitingPickup)
    .where('pickupDeadline', '<', at)
    .get()
  return result.docs.map(toRecord)
}

// Os pedidos aguardando retirada com o prazo de `from` (inclusive) até `to`
// (exclusive): o "último dia para retirar" (rotina `due_reminders`).
export async function listAwaitingPickupDueBetween(
  from: Date,
  to: Date,
): Promise<LoanRecord[]> {
  const result = await loans()
    .where('status', '==', LOAN_STATUS.awaitingPickup)
    .where('pickupDeadline', '>=', from)
    .where('pickupDeadline', '<', to)
    .get()
  return result.docs.map(toRecord)
}

// Os empréstimos ativos que vencem antes de `before`, inclusive os já atrasados
// (rotinas `due_reminders` e `accrue_fines`; índice status + dueAt).
export async function listActiveDueBefore(before: Date): Promise<LoanRecord[]> {
  const result = await loans()
    .where('status', '==', LOAN_STATUS.active)
    .where('dueAt', '<', before)
    .get()
  return result.docs.map(toRecord)
}

// Quantas devoluções foram registradas de `from` (inclusive) até `to` (exclusive),
// pelo índice status + returnedAt (Painel, RF-BAL-01).
export async function countReturnedBetween(
  from: Date,
  to: Date,
): Promise<number> {
  const result = await loans()
    .where('status', '==', LOAN_STATUS.returned)
    .where('returnedAt', '>=', from)
    .where('returnedAt', '<', to)
    .count()
    .get()
  return result.data().count
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
