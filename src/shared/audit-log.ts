import type { Transaction } from 'firebase-admin/firestore'
import { getDb } from '../config/firebase.js'
import { COLLECTIONS } from './firestore/collections.js'
import type { AuditLogEntry } from './types/index.js'

// Dados de uma entrada do log; createdAt e updatedAt são preenchidos aqui.
export type AuditLogInput = Omit<AuditLogEntry, 'createdAt' | 'updatedAt'>

// Grava no auditLog (seção 2.22) uma ação sensível, dentro da transação.
// Chame depois de todas as leituras da transação.
export function writeAuditLog(
  tx: Transaction,
  entry: AuditLogInput,
  now: Date,
): void {
  const defined = Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined),
  )
  tx.set(getDb().collection(COLLECTIONS.auditLog).doc(), {
    ...defined,
    createdAt: now,
    updatedAt: now,
  })
}
