import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../config/firebase.js'
import { COLLECTIONS } from '../firestore/collections.js'
import { dataWithDates } from '../firestore/converters.js'
import { readDocument } from '../firestore/read.js'
import type { NotificationPrefs, User } from '../types/index.js'

// Acesso ao documento users/{uid}, usado por mais de um módulo (cadastro,
// empréstimos, filas, multas e balcão). O que só o cadastro usa (índices,
// aluno pendente, ativação, login) fica em modules/auth/repositories. O
// parâmetro tx é opcional nas leituras: com ele, a leitura entra na transação.

// Referência ao documento de um usuário.
export const userRef = (uid: string) =>
  getDb().collection(COLLECTIONS.users).doc(uid)

// Campos de data do documento users que o Firestore devolve como Timestamp.
const USER_DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'emailVerifiedAt',
  'onboardingSeenAt',
  'lastLoginAt',
] as const

// Converte o documento lido em User, trocando os Timestamps por Date.
function toUser(snapshot: DocumentSnapshot): User {
  return dataWithDates(snapshot, USER_DATE_FIELDS) as unknown as User
}

// Lê o documento do usuário. Não devolve nada se ele não existir.
export async function findById(
  uid: string,
  tx?: Transaction,
): Promise<User | undefined> {
  const snapshot = await readDocument(userRef(uid), tx)
  return snapshot.exists ? toUser(snapshot) : undefined
}

// Acha o uid de quem tem a matrícula (matriculaIndex). Não devolve nada para
// matrícula sem conta.
export async function findUidByMatricula(
  matricula: string,
  tx?: Transaction,
): Promise<string | undefined> {
  const index = await readDocument(
    getDb().collection(COLLECTIONS.matriculaIndex).doc(matricula),
    tx,
  )
  return index.exists ? (index.get('uid') as string) : undefined
}

// Grava quantos pedidos e empréstimos o aluno tem em andamento (pedido, cancelamento
// e devolução, seção 3). Chame depois de todas as leituras da transação.
export function setActiveLoanCount(
  tx: Transaction,
  uid: string,
  count: number,
  at: Date,
): void {
  tx.update(userRef(uid), { activeLoanCount: count, updatedAt: at })
}

// Grava quantos lugares em fila ativa o aluno tem (entrar, sair, confirmar a vez,
// perder a vez e remoção, seção 3). Chame depois de todas as leituras da
// transação.
export function setActiveQueueCount(
  tx: Transaction,
  uid: string,
  count: number,
  at: Date,
): void {
  tx.update(userRef(uid), { activeQueueCount: count, updatedAt: at })
}

// Grava o total das multas em aberto do aluno, em centavos (devolução com multa
// e pagamento, seção 3). Chame depois de todas as leituras da transação.
export function setOpenFineTotalCents(
  tx: Transaction,
  uid: string,
  cents: number,
  at: Date,
): void {
  tx.update(userRef(uid), { openFineTotalCents: cents, updatedAt: at })
}

// Grava quantos livros o aluno leu em cada ano (a devolução soma 1 ao ano da
// devolução, seção 3). Chame depois de todas as leituras da transação.
export function setBooksReadByYear(
  tx: Transaction,
  uid: string,
  booksReadByYear: Record<string, number>,
  at: Date,
): void {
  tx.update(userRef(uid), { booksReadByYear, updatedAt: at })
}

// Grava as preferências de aviso do aluno (RF-AVI-03). Chame depois de todas as
// leituras da transação.
export function setNotificationPrefs(
  tx: Transaction,
  uid: string,
  notificationPrefs: NotificationPrefs,
  at: Date,
): void {
  tx.update(userRef(uid), { notificationPrefs, updatedAt: at })
}
