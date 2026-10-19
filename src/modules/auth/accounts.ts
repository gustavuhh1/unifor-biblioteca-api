import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore'
import type { UserRole } from '../../shared/user-role.js'

// Collection names, as in docs/modelo-de-dados-firestore.md.
export const USERS = 'users'
export const MATRICULA_INDEX = 'matriculaIndex'
export const EMAIL_INDEX = 'emailIndex'
export const EMAIL_TOKENS = 'emailTokens'
export const PASSKEYS = 'passkeys'
export const PASSKEY_CHALLENGES = 'passkeyChallenges'
export const AUDIT_LOG = 'auditLog'

// Firestore returns a Timestamp; the tests (and the code that builds a
// document) hold a Date. Both are accepted.
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate() as Date
  }
  throw new Error('Expected a date in the document.')
}

export function optionalDate(value: unknown): Date | null {
  return value === undefined || value === null ? null : toDate(value)
}

// Lets the lookups below run inside or outside a transaction.
export type Reader = (ref: DocumentReference) => Promise<DocumentSnapshot>

export const plainReader: Reader = (ref) => ref.get()

export function transactionReader(tx: Transaction): Reader {
  return (ref) => tx.get(ref)
}

export interface Account {
  uid: string
  ref: DocumentReference
  user: DocumentSnapshot
}

// matriculaIndex → users. Nothing comes back for a matrícula without account.
export async function findAccountByMatricula(
  db: Firestore,
  read: Reader,
  matricula: string,
): Promise<Account | undefined> {
  const index = await read(db.collection(MATRICULA_INDEX).doc(matricula))
  if (!index.exists) return undefined
  const uid = index.get('uid') as string
  const ref = db.collection(USERS).doc(uid)
  const user = await read(ref)
  return user.exists ? { uid, ref, user } : undefined
}

export type AuditAction = 'passkey_create' | 'passkey_remove' | 'password_reset'

// Sensitive actions of the access module (docs/modelo-de-dados-firestore.md,
// 2.22). Call it after every read of the transaction.
export function writeAuditLog(
  tx: Transaction,
  db: Firestore,
  entry: {
    actorUid: string
    actorRole: UserRole
    action: AuditAction
    entityId?: string
  },
  now: Date,
): void {
  tx.set(db.collection(AUDIT_LOG).doc(), {
    actorUid: entry.actorUid,
    actorRole: entry.actorRole,
    action: entry.action,
    targetUid: entry.actorUid,
    ...(entry.entityId ? { entityId: entry.entityId } : {}),
    createdAt: now,
    updatedAt: now,
  })
}
