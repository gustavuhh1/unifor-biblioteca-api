import type {
  DocumentSnapshot,
  Query,
  Transaction,
} from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import {
  dataWithDates,
  withoutUndefined,
} from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import {
  FINE_STATUS,
  type Fine,
  type FineRecord,
  type FineStatus,
} from '../../../shared/types/index.js'
import { FINE_LIST_LIMIT } from '../fines.constants.js'

// Acesso ao Firestore da coleção fines (seção 2.11). Toda função que grava recebe
// tx e deve ser chamada depois de todas as leituras da transação.

const fines = () => getDb().collection(COLLECTIONS.fines)

// Campos de data do documento que o Firestore devolve como Timestamp.
const FINE_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'dueAt',
  'frozenAt',
  'paidAt',
] as const

// Converte o documento lido em FineRecord (com o id), trocando os Timestamps por
// Date.
function toRecord(snapshot: DocumentSnapshot): FineRecord {
  return {
    id: snapshot.id,
    ...dataWithDates(snapshot, FINE_DATE_FIELDS),
  } as unknown as FineRecord
}

// Gera o id de uma multa nova, sem gravar nada.
export function newFineId(): string {
  return fines().doc().id
}

// Lê uma multa. Com tx, a leitura entra na transação. Não devolve nada se ela não
// existir.
export async function findById(
  id: string,
  tx?: Transaction,
): Promise<FineRecord | undefined> {
  const snapshot = await readDocument(fines().doc(id), tx)
  return snapshot.exists ? toRecord(snapshot) : undefined
}

// As multas do aluno, as de vencimento mais recente primeiro (RF-MUL-03). A busca
// usa só o índice automático de studentUid; a ordem é feita aqui, em memória (são
// poucas multas por aluno), para não pedir um índice composto novo.
export async function listByStudent(uid: string): Promise<FineRecord[]> {
  const result = await fines()
    .where('studentUid', '==', uid)
    .limit(FINE_LIST_LIMIT)
    .get()
  return result.docs
    .map(toRecord)
    .sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime())
}

// Como cada aba da aba Multas ordena (índices status + frozenAt, dueAt, paidAt):
// Em aberto, as devolvidas há menos tempo primeiro; Contando, as de vencimento
// mais antigo primeiro; Pagas, as pagas há menos tempo primeiro.
function orderedByStatus(status: FineStatus): Query {
  const byStatus = fines().where('status', '==', status)
  switch (status) {
    case FINE_STATUS.open:
      return byStatus.orderBy('frozenAt', 'desc')
    case FINE_STATUS.accruing:
      return byStatus.orderBy('dueAt', 'asc')
    case FINE_STATUS.paid:
      return byStatus.orderBy('paidAt', 'desc')
  }
}

// As multas de uma aba da aba Multas (RF-BAL-09), até FINE_LIST_LIMIT.
export async function listByStatus(status: FineStatus): Promise<FineRecord[]> {
  const result = await orderedByStatus(status).limit(FINE_LIST_LIMIT).get()
  return result.docs.map(toRecord)
}

// Quantas multas têm o estado dado (Painel do balcão: `open` = devolvidas, falta
// pagar, RF-BAL-01).
export async function countByStatus(status: FineStatus): Promise<number> {
  const result = await fines().where('status', '==', status).count().get()
  return result.data().count
}

// Grava uma multa nova (devolução de um empréstimo atrasado, RF-MUL-02).
export function create(tx: Transaction, id: string, fine: Fine): void {
  tx.set(fines().doc(id), withoutUndefined(fine))
}

// Atualiza campos de uma multa (congelamento e pagamento).
export function update(
  tx: Transaction,
  id: string,
  fields: Partial<Fine>,
): void {
  tx.update(fines().doc(id), withoutUndefined(fields))
}
