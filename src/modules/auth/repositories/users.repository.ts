import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import { dataWithDates } from '../../../shared/firestore/converters.js'
import { readDocument } from '../../../shared/firestore/read.js'
import {
  USER_ROLE,
  USER_STATUS,
  type MatriculaIndex,
  type User,
  type EmailIndex,
} from '../../../shared/types/index.js'
import type { IndexOwners, PendingStudent, UserAccount } from '../auth.types.js'

// Acesso ao Firestore das coleções users, matriculaIndex e emailIndex. O
// parâmetro tx é opcional nas leituras: com ele, a leitura entra na transação.

const usersRef = (uid: string) => getDb().collection(COLLECTIONS.users).doc(uid)
const matriculaRef = (matricula: string) =>
  getDb().collection(COLLECTIONS.matriculaIndex).doc(matricula)
const emailRef = (email: string) =>
  getDb().collection(COLLECTIONS.emailIndex).doc(email)

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

// Gera o id de um usuário novo, sem gravar nada.
export function newUid(): string {
  return getDb().collection(COLLECTIONS.users).doc().id
}

// Diz quem já ocupa a matrícula e o e-mail de um cadastro (RF-AUT-01).
export async function findIndexOwners(
  tx: Transaction,
  matricula: string,
  email: string,
): Promise<IndexOwners> {
  const [matriculaIndex, emailIndex] = await tx.getAll(
    matriculaRef(matricula),
    emailRef(email),
  )
  return {
    ...(matriculaIndex?.exists
      ? { matriculaOwnerUid: matriculaIndex.get('uid') as string }
      : {}),
    ...(emailIndex?.exists
      ? { emailOwnerUid: emailIndex.get('uid') as string }
      : {}),
  }
}

// Acha a conta de uma matrícula (matriculaIndex → users). Não devolve nada para
// matrícula sem conta.
export async function findByMatricula(
  matricula: string,
  tx?: Transaction,
): Promise<UserAccount | undefined> {
  const index = await readDocument(matriculaRef(matricula), tx)
  if (!index.exists) return undefined
  const uid = index.get('uid') as string
  const user = await readDocument(usersRef(uid), tx)
  if (!user.exists) return undefined
  return {
    uid,
    role: user.get('role') as UserAccount['role'],
    status: user.get('status') as UserAccount['status'],
    email: user.get('email') as string,
  }
}

// Acha o aluno que se cadastrou e ainda não confirmou o e-mail (pending_email).
export async function findPendingByMatricula(
  tx: Transaction,
  matricula: string,
): Promise<PendingStudent | undefined> {
  const account = await findByMatricula(matricula, tx)
  return account?.role === USER_ROLE.student &&
    account.status === USER_STATUS.pendingEmail
    ? { uid: account.uid, email: account.email }
    : undefined
}

// Lê o documento do usuário. Não devolve nada se ele não existir.
export async function findById(
  uid: string,
  tx?: Transaction,
): Promise<User | undefined> {
  const snapshot = await readDocument(usersRef(uid), tx)
  return snapshot.exists ? toUser(snapshot) : undefined
}

// Cria o aluno pendente com os seus dois índices, de uma vez (RF-AUT-01).
export function createPendingStudent(
  tx: Transaction,
  uid: string,
  user: User,
  now: Date,
): void {
  const index: Pick<
    MatriculaIndex,
    'uid' | 'role' | 'createdAt' | 'updatedAt'
  > = { uid, role: user.role, createdAt: now, updatedAt: now }
  const emailIndex: EmailIndex = { uid, createdAt: now, updatedAt: now }
  tx.set(matriculaRef(user.matricula), index)
  tx.set(emailRef(user.email), emailIndex)
  tx.set(usersRef(uid), user)
}

// Troca o e-mail de um aluno pendente (RF-AUT-03): move o emailIndex e atualiza
// o documento do usuário.
export function replacePendingEmail(
  tx: Transaction,
  input: { uid: string; oldEmail: string; newEmail: string },
  now: Date,
): void {
  if (input.oldEmail !== input.newEmail) {
    tx.delete(emailRef(input.oldEmail))
    const emailIndex: EmailIndex = {
      uid: input.uid,
      createdAt: now,
      updatedAt: now,
    }
    tx.set(emailRef(input.newEmail), emailIndex)
  }
  tx.update(usersRef(input.uid), { email: input.newEmail, updatedAt: now })
}

// Apaga o aluno pendente e os seus dois índices (desfaz um cadastro que falhou).
export function deletePendingStudent(
  tx: Transaction,
  input: { uid: string; matricula: string; email: string },
): void {
  tx.delete(usersRef(input.uid))
  tx.delete(matriculaRef(input.matricula))
  tx.delete(emailRef(input.email))
}

// Ativa a conta depois do token confirmado (RF-AUT-03).
export function activate(tx: Transaction, uid: string, now: Date): void {
  tx.update(usersRef(uid), {
    status: USER_STATUS.active,
    emailVerifiedAt: now,
    updatedAt: now,
  })
}

// Grava o último login conhecido pela API (login com passkey).
export function recordLogin(tx: Transaction, uid: string, now: Date): void {
  tx.update(usersRef(uid), { lastLoginAt: now, updatedAt: now })
}

// Grava o nome informado no Perfil, com o nome normalizado e as iniciais.
export async function updateFullName(
  uid: string,
  fields: Pick<User, 'fullName' | 'fullNameNormalized' | 'initials'>,
  now: Date,
): Promise<void> {
  await usersRef(uid).update({ ...fields, updatedAt: now })
}

// Grava quantos pedidos e empréstimos o aluno tem em andamento (pedido, cancelamento
// e devolução, seção 3). Chame depois de todas as leituras da transação.
export function setActiveLoanCount(
  tx: Transaction,
  uid: string,
  count: number,
  at: Date,
): void {
  tx.update(usersRef(uid), { activeLoanCount: count, updatedAt: at })
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
  tx.update(usersRef(uid), { activeQueueCount: count, updatedAt: at })
}

// Grava o total das multas em aberto do aluno, em centavos (devolução com multa
// e pagamento, seção 3). Chame depois de todas as leituras da transação.
export function setOpenFineTotalCents(
  tx: Transaction,
  uid: string,
  cents: number,
  at: Date,
): void {
  tx.update(usersRef(uid), { openFineTotalCents: cents, updatedAt: at })
}
