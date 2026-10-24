import type { Transaction } from 'firebase-admin/firestore'
import { getDb } from '../../../config/firebase.js'
import { COLLECTIONS } from '../../../shared/firestore/collections.js'
import * as usersRepository from '../../../shared/repositories/users.repository.js'
import {
  USER_ROLE,
  USER_STATUS,
  type MatriculaIndex,
  type User,
  type EmailIndex,
} from '../../../shared/types/index.js'
import type { IndexOwners, PendingStudent, UserAccount } from '../auth.types.js'

// Acesso ao Firestore do que só o cadastro e o acesso usam: os índices
// matriculaIndex e emailIndex e o ciclo da conta (aluno pendente, ativação,
// login). Ler o documento do usuário e os contadores está em
// shared/repositories/users.repository. O parâmetro tx é opcional nas leituras:
// com ele, a leitura entra na transação.

const matriculaRef = (matricula: string) =>
  getDb().collection(COLLECTIONS.matriculaIndex).doc(matricula)
const emailRef = (email: string) =>
  getDb().collection(COLLECTIONS.emailIndex).doc(email)

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
  const uid = await usersRepository.findUidByMatricula(matricula, tx)
  if (!uid) return undefined
  const user = await usersRepository.findById(uid, tx)
  if (!user) return undefined
  return { uid, role: user.role, status: user.status, email: user.email }
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
  tx.set(usersRepository.userRef(uid), user)
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
  tx.update(usersRepository.userRef(input.uid), {
    email: input.newEmail,
    updatedAt: now,
  })
}

// Apaga o aluno pendente e os seus dois índices (desfaz um cadastro que falhou).
export function deletePendingStudent(
  tx: Transaction,
  input: { uid: string; matricula: string; email: string },
): void {
  tx.delete(usersRepository.userRef(input.uid))
  tx.delete(matriculaRef(input.matricula))
  tx.delete(emailRef(input.email))
}

// Ativa a conta depois do token confirmado (RF-AUT-03).
export function activate(tx: Transaction, uid: string, now: Date): void {
  tx.update(usersRepository.userRef(uid), {
    status: USER_STATUS.active,
    emailVerifiedAt: now,
    updatedAt: now,
  })
}

// Grava o último login conhecido pela API (login com passkey).
export function recordLogin(tx: Transaction, uid: string, now: Date): void {
  tx.update(usersRepository.userRef(uid), { lastLoginAt: now, updatedAt: now })
}

// Grava o nome informado no Perfil, com o nome normalizado e as iniciais.
export async function updateFullName(
  uid: string,
  fields: Pick<User, 'fullName' | 'fullNameNormalized' | 'initials'>,
  now: Date,
): Promise<void> {
  await usersRepository.userRef(uid).update({ ...fields, updatedAt: now })
}
